// ===== Configuração =====
const STATUS_FIELD = "hsp_statusreserva";
const STATUS_PENDENTE = 1;                // palpite: confirmar o valor da opção Pendente
const HOTEL_FIELD = "hsp_hotel";
const PRINCIPAL_FIELD = "hsp_hospede";    // Hóspede principal (lookup)
const QTD_FIELD = "hsp_quantidadehospedes";
const SUBGRID = "sub_reservas_hospedes";
const RELATIONSHIP = "hsp_hospede_reserva";
const RESERVA_TABLE = "hsp_reserva";      // nome lógico da tabela
const RESERVA_SET = "hsp_reservas";       // conjunto de entidades (aparece no seu log)

// Troque para false se, ao TROCAR de um hotel para outro, o hóspede principal deve ser mantido
const LIMPAR_PRINCIPAL_NA_TROCA = true;

let hotelAnterior = null;
let processandoTroca = false;
let sincronizando = false;
let repetirSincronizacao = false;

function limparId(id) {
    return (id || "").replace(/[{}]/g, "").toLowerCase();
}

function ehPendente(formContext) {
    const status = formContext.getAttribute(STATUS_FIELD);
    return !!status && status.getValue() === STATUS_PENDENTE;
}

// ===== OnLoad do formulário =====
function inicializarReserva(executionContext) {
    const formContext = executionContext.getFormContext();

    const campoHotel = formContext.getAttribute(HOTEL_FIELD);
    if (campoHotel) {
        campoHotel.setRequiredLevel("required");
        hotelAnterior = campoHotel.getValue();
    }

    // Quantidade é calculada pelo script: somente leitura e sem obrigatoriedade
    const campoQtd = formContext.getAttribute(QTD_FIELD);
    if (campoQtd) {
        campoQtd.setRequiredLevel("none");
        const controleQtd = formContext.getControl(QTD_FIELD);
        if (controleQtd) controleQtd.setDisabled(true);
    }

    travarHotelSeNaoPendente(executionContext);

    // Em reserva nova, já considera o principal (se vier preenchido)
    if (formContext.ui.getFormType() === 1) {
        sincronizarQuantidade(formContext);
    }

    // Recalcula sempre que a subgrid recarregar (inclusão, remoção, botão Remover)
    registrarListenerSubgrid(formContext, 0);
}

function registrarListenerSubgrid(formContext, tentativa) {
    const grid = formContext.getControl(SUBGRID);
    if (grid && typeof grid.addOnLoad === "function") {
        grid.addOnLoad(() => sincronizarQuantidade(formContext));
        return;
    }
    // A subgrid carrega de forma assíncrona: tenta de novo por até 5 segundos
    if (tentativa < 10) {
        setTimeout(() => registrarListenerSubgrid(formContext, tentativa + 1), 500);
    }
}

// ===== OnLoad e OnChange do campo de status =====
function travarHotelSeNaoPendente(executionContext) {
    const formContext = executionContext.getFormContext();
    const controleHotel = formContext.getControl(HOTEL_FIELD);
    if (!controleHotel) return;

    const novo = formContext.ui.getFormType() === 1;
    controleHotel.setDisabled(!novo && !ehPendente(formContext));
}

// ===== OnChange do campo Hóspede principal =====
async function aoAlterarPrincipal(executionContext) {
    const formContext = executionContext.getFormContext();
    await sincronizarQuantidade(formContext);
}

// ===== Contagem e sincronização da quantidade =====
async function listarIdsHospedes(reservaId) {
    const reserva = await Xrm.WebApi.retrieveRecord(
        RESERVA_TABLE,
        reservaId,
        `?$select=${RESERVA_TABLE}id&$expand=${RELATIONSHIP}($select=contactid)`
    );
    return (reserva[RELATIONSHIP] || []).map(h => limparId(h.contactid));
}

async function sincronizarQuantidade(formContext) {
    // Se já está sincronizando, marca para repetir no fim (evita perder uma alteração)
    if (sincronizando) {
        repetirSincronizacao = true;
        return;
    }

    const campoQtd = formContext.getAttribute(QTD_FIELD);
    if (!campoQtd) return;

    const campoPrincipal = formContext.getAttribute(PRINCIPAL_FIELD);
    const principal = campoPrincipal ? campoPrincipal.getValue() : null;
    const reservaId = limparId(formContext.data.entity.getId());

    sincronizando = true;
    try {
        // Hóspedes da grade + principal, sem duplicar quem está nos dois
        const ids = new Set(reservaId ? await listarIdsHospedes(reservaId) : []);
        if (principal) ids.add(limparId(principal[0].id));
        const total = ids.size;

        if (campoQtd.getValue() === total) return;
        campoQtd.setValue(total);

        // Se o principal tem alteração ainda não salva, a quantidade segue junto no Salvar.
        // Gravar agora no servidor deixaria a quantidade à frente do principal gravado.
        const principalPendente = !!campoPrincipal && campoPrincipal.getIsDirty();
        if (reservaId && !principalPendente) {
            await Xrm.WebApi.updateRecord(RESERVA_TABLE, reservaId, { [QTD_FIELD]: total });
        }
    } catch (e) {
        console.error("Falha ao atualizar a quantidade de hóspedes:", e);
    } finally {
        sincronizando = false;
        if (repetirSincronizacao) {
            repetirSincronizacao = false;
            sincronizarQuantidade(formContext);
        }
    }
}

// ===== Desassociação N:N (DELETE no formato correto) =====
async function desassociarHospede(reservaId, contactId) {
    const baseUrl = Xrm.Utility.getGlobalContext().getClientUrl();
    const url = `${baseUrl}/api/data/v9.2/${RESERVA_SET}(${reservaId})/${RELATIONSHIP}(${contactId})/$ref`;

    const resp = await fetch(url, {
        method: "DELETE",
        headers: {
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            "Accept": "application/json"
        }
    });

    if (!resp.ok) {
        throw new Error(`Falha ao desassociar (${resp.status}): ${await resp.text()}`);
    }
}

async function desassociarTodos(reservaId) {
    const ids = await listarIdsHospedes(reservaId);
    for (const contactId of ids) {
        await desassociarHospede(reservaId, contactId);
    }
    return ids.length;
}

// ===== OnChange do campo Hotel =====
async function aoAlterarHotel(executionContext) {
    if (processandoTroca) return;

    const formContext = executionContext.getFormContext();
    const campoHotel = formContext.getAttribute(HOTEL_FIELD);
    const novoHotel = campoHotel.getValue();

    const idAnterior = hotelAnterior ? limparId(hotelAnterior[0].id) : null;
    const idNovo = novoHotel ? limparId(novoHotel[0].id) : null;

    if (idAnterior === idNovo) return;

    // O principal só é limpo se já havia um hotel antes (escolher o primeiro hotel não limpa nada)
    const campoPrincipal = formContext.getAttribute(PRINCIPAL_FIELD);
    const principalPreenchido = !!campoPrincipal && !!campoPrincipal.getValue();
    const hotelFoiEsvaziado = !novoHotel;
    const deveLimparPrincipal =
        principalPreenchido &&
        idAnterior !== null &&
        (hotelFoiEsvaziado || LIMPAR_PRINCIPAL_NA_TROCA);

    const reservaId = limparId(formContext.data.entity.getId());

    // Reserva ainda não salva: não há hóspedes associados
    if (!reservaId) {
        if (deveLimparPrincipal) campoPrincipal.setValue(null);
        hotelAnterior = novoHotel;
        await sincronizarQuantidade(formContext);
        return;
    }

    // Fora de Pendente a troca não é permitida: restaura
    if (!ehPendente(formContext)) {
        processandoTroca = true;
        campoHotel.setValue(hotelAnterior);
        processandoTroca = false;
        await Xrm.Navigation.openAlertDialog({
            text: "O hotel só pode ser alterado com a reserva em Pendente."
        });
        return;
    }

    const total = (await listarIdsHospedes(reservaId)).length;

    // Nada a limpar
    if (total === 0 && !deveLimparPrincipal) {
        hotelAnterior = novoHotel;
        return;
    }

    const itens = [];
    if (total > 0) {
        itens.push(`remover os ${total} hóspede(s) associados desta reserva (os cadastros são mantidos)`);
    }
    if (deveLimparPrincipal) {
        itens.push("limpar o hóspede principal");
    }

    const confirmacao = await Xrm.Navigation.openConfirmDialog({
        title: "Alterar hotel da reserva",
        text: `Ao ${novoHotel ? "trocar" : "esvaziar"} o hotel, será necessário ${itens.join(" e ")}. Continuar?`
    });

    if (!confirmacao.confirmed) {
        processandoTroca = true;
        campoHotel.setValue(hotelAnterior);
        processandoTroca = false;
        return;
    }

    try {
        if (total > 0) await desassociarTodos(reservaId);
    } catch (e) {
        processandoTroca = true;
        campoHotel.setValue(hotelAnterior);
        processandoTroca = false;
        await Xrm.Navigation.openAlertDialog({
            text: "Não foi possível remover os hóspedes. O hotel anterior foi restaurado.\n" + e.message
        });
        const gridErro = formContext.getControl(SUBGRID);
        if (gridErro) gridErro.refresh();
        return;
    }

    if (deveLimparPrincipal) campoPrincipal.setValue(null);

    hotelAnterior = novoHotel;

    const grid = formContext.getControl(SUBGRID);
    if (grid) grid.refresh();

    await sincronizarQuantidade(formContext);
}

// ===== Botão "Adicionar Hóspede do Hotel" (barra da subgrid) =====
async function adicionarHospedeDoHotel(primaryControl) {
    const formContext = primaryControl;

    if (!ehPendente(formContext)) {
        await Xrm.Navigation.openAlertDialog({
            text: "Só é possível adicionar hóspedes com a reserva em Pendente."
        });
        return;
    }

    const campoHotel = formContext.getAttribute(HOTEL_FIELD);
    if (!campoHotel) {
        await Xrm.Navigation.openAlertDialog({ text: "Campo Hotel não encontrado no formulário da Reserva." });
        return;
    }

    const hotel = campoHotel.getValue();
    if (!hotel) {
        await Xrm.Navigation.openAlertDialog({ text: "Selecione o hotel antes de adicionar hóspedes." });
        return;
    }

    const reservaId = limparId(formContext.data.entity.getId());
    if (!reservaId) {
        await Xrm.Navigation.openAlertDialog({ text: "Salve a reserva antes de adicionar hóspedes." });
        return;
    }

    if (campoHotel.getIsDirty()) {
        await Xrm.Navigation.openAlertDialog({
            text: "O hotel foi alterado e ainda não foi salvo. Salve a reserva antes de adicionar hóspedes."
        });
        return;
    }

    const hotelId = limparId(hotel[0].id);

    // Hóspede principal (valor atual do formulário)
    const campoPrincipal = formContext.getAttribute(PRINCIPAL_FIELD);
    const principal = campoPrincipal ? campoPrincipal.getValue() : null;
    const principalId = principal ? limparId(principal[0].id) : null;

    // Quem sai da lista de busca: o principal e quem já está associado à reserva
    const excluir = new Set(await listarIdsHospedes(reservaId));
    if (principalId) excluir.add(principalId);

    let condicaoExclusao = "";
    if (excluir.size > 0) {
        const valores = Array.from(excluir).map(id => `<value>${id}</value>`).join("");
        condicaoExclusao = `<condition attribute="contactid" operator="not-in">${valores}</condition>`;
    }

    const selecionados = await Xrm.Utility.lookupObjects({
        allowMultiSelect: true,
        defaultEntityType: "contact",
        entityTypes: ["contact"],
        disableMru: true,
        filters: [{
            entityLogicalName: "contact",
            filterXml:
                `<filter type="and">` +
                `<condition attribute="hsp_hotel" operator="eq" value="${hotelId}"/>` +
                condicaoExclusao +
                `</filter>`
        }]
    });
    if (!selecionados || selecionados.length === 0) return;

    const rejeitados = [];

    for (const h of selecionados) {
        const contactId = limparId(h.id);

        // Segunda barreira, caso o painel deixe passar algum registro excluído
        if (excluir.has(contactId)) continue;

        const contato = await Xrm.WebApi.retrieveRecord(
            "contact", contactId, "?$select=_hsp_hotel_value,fullname"
        );

        if (contato["_hsp_hotel_value"] !== hotelId) {
            rejeitados.push(contato.fullname);
            continue;
        }

        const request = {
            target: { entityType: RESERVA_TABLE, id: reservaId },
            relatedEntities: [{ entityType: "contact", id: contactId }],
            relationship: RELATIONSHIP,
            getMetadata: () => ({
                boundParameter: null,
                parameterTypes: {},
                operationType: 2,
                operationName: "Associate"
            })
        };
        await Xrm.WebApi.online.execute(request);
    }

    if (rejeitados.length > 0) {
        await Xrm.Navigation.openAlertDialog({
            text: "Não adicionados (hóspedes de outro hotel ou sem hotel): " + rejeitados.join(", ")
        });
    }

    const grid = formContext.getControl(SUBGRID);
    if (grid) grid.refresh();

    await sincronizarQuantidade(formContext);
}

// ===== Botão opcional "Limpar hóspedes" (barra do formulário da Reserva) =====
async function limparHospedes(primaryControl) {
    const formContext = primaryControl;

    if (!ehPendente(formContext)) {
        await Xrm.Navigation.openAlertDialog({
            text: "Só é possível remover hóspedes com a reserva em Pendente."
        });
        return;
    }

    const reservaId = limparId(formContext.data.entity.getId());
    if (!reservaId) {
        await Xrm.Navigation.openAlertDialog({ text: "Salve a reserva antes." });
        return;
    }

    const confirmacao = await Xrm.Navigation.openConfirmDialog({
        title: "Remover hóspedes",
        text: "Isso remove todos os hóspedes da grade desta reserva (os cadastros são mantidos). Continuar?"
    });
    if (!confirmacao.confirmed) return;

    try {
        const total = await desassociarTodos(reservaId);
        if (total === 0) {
            await Xrm.Navigation.openAlertDialog({ text: "Não há hóspedes associados." });
        }
    } catch (e) {
        await Xrm.Navigation.openAlertDialog({ text: "Não foi possível remover os hóspedes.\n" + e.message });
    }

    const grid = formContext.getControl(SUBGRID);
    if (grid) grid.refresh();

    await sincronizarQuantidade(formContext);
}
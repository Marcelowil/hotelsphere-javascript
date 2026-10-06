async function adicionarHospedeDoHotel(primaryControl) {
    const formContext = primaryControl;

    const limparId = id => (id || "").replace(/[{}]/g, "").toLowerCase();

    const STATUS_PENDENTE = 1;
    const status = formContext.getAttribute("hsp_statusreserva");
    if (!status || status.getValue() !== STATUS_PENDENTE) {
        await Xrm.Navigation.openAlertDialog({
            text: "Só é possível adicionar hóspedes com a reserva em Pendente."
        });
        return;
    }

    const campoHotel = formContext.getAttribute("hsp_hotel");
    if (!campoHotel) {
        await Xrm.Navigation.openAlertDialog({ text: "Campo Hotel não encontrado no formulário da Reserva." });
        return;
    }

    const hotel = campoHotel.getValue();
    if (!hotel) {
        await Xrm.Navigation.openAlertDialog({ text: "Selecione o hotel antes de adicionar hóspedes." });
        return;
    }

    const hotelId = limparId(hotel[0].id);
    const reservaId = limparId(formContext.data.entity.getId());

    if (!reservaId) {
        await Xrm.Navigation.openAlertDialog({ text: "Salve a reserva antes de adicionar hóspedes." });
        return;
    }

    const campoPrincipal = formContext.getAttribute("hsp_hospede");
    const principal = campoPrincipal ? campoPrincipal.getValue() : null;
    const principalId = principal ? limparId(principal[0].id) : null;

    const reserva = await Xrm.WebApi.retrieveRecord(
        "hsp_reserva",
        reservaId,
        "?$select=hsp_reservaid&$expand=hsp_hospede_reserva($select=contactid)"
    );
    const excluir = new Set(
        (reserva["hsp_hospede_reserva"] || []).map(h => limparId(h.contactid))
    );
    if (principalId) excluir.add(principalId);

    const respContatos = await Xrm.WebApi.retrieveMultipleRecords(
        "contact",
        `?$select=contactid&$filter=_hsp_hotel_value eq ${hotelId}`
    );

    const elegiveis = respContatos.entities
        .map(c => limparId(c.contactid))
        .filter(id => !excluir.has(id));

    if (elegiveis.length === 0) {
        await Xrm.Navigation.openAlertDialog({
            text: "Não há hóspedes disponíveis neste hotel para adicionar."
        });
        return;
    }

    const valoresIn = elegiveis.map(id => `<value>${id}</value>`).join("");

    const selecionados = await Xrm.Utility.lookupObjects({
        allowMultiSelect: true,
        defaultEntityType: "contact",
        entityTypes: ["contact"],
        disableMru: true,
        filters: [{
            entityLogicalName: "contact",
            filterXml:
                `<filter type='and'>` +
                `<condition attribute='contactid' operator='in'>${valoresIn}</condition>` +
                `</filter>`
        }]
    });
    if (!selecionados || selecionados.length === 0) return;

    const rejeitados = [];

    for (const h of selecionados) {
        const contactId = limparId(h.id);

        if (excluir.has(contactId)) continue;

        const contato = await Xrm.WebApi.retrieveRecord(
            "contact", contactId, "?$select=_hsp_hotel_value,fullname"
        );

        if (contato["_hsp_hotel_value"] !== hotelId) {
            rejeitados.push(contato.fullname);
            continue;
        }

        const request = {
            target: { entityType: "hsp_reserva", id: reservaId },
            relatedEntities: [{ entityType: "contact", id: contactId }],
            relationship: "hsp_hospede_reserva",
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

    formContext.getControl("sub_reservas_hospedes").refresh();
}
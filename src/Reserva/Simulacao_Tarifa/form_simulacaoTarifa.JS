var HS = HS || {};
HS.Reserva = (function () {
    "use strict";

    var CONFIG = {
        campos: {
            quarto: "hsp_quarto",
            entrada: "hsp_dataentrada",
            saida: "hsp_datadesaida",
            status: "hsp_statusreserva",
            tarifa: "hsp_tarifa",
            valorDiaria: "hsp_valordiaria",
            valorTotal: "hsp_valortotal"
        },
        textoStatusPendente: "Pendente",
        quarto: {
            tabela: "hsp_quarto",
            lookupTipoQuarto: "hsp_tipodequarto"
        },
        tarifa: {
            tabela: "hsp_tarifa",
            id: "hsp_tarifaid",
            codigo: "hsp_codigotarifa",
            valor: "hsp_valordiaria",
            inicio: "hsp_datainicio",
            fim: "hsp_datafinal",
            lookupTipoQuarto: "hsp_tipodequarto",
            campoVigente: "hsp_tarifavigente",
            filtrarTarifaVigente: false   // true = exige hsp_tarifavigente = Sim (campo Sim/Não)
        },
        controles: {
            webResource: "WebResource_simulacaotarifas",
            secaoSimulacao: "simulacao_tarifas",
            secaoDiarias: "diarias_reserva"
        }
    };

    var _ctx = null;
    var _timer = null;
    var _seq = 0;
    var _ultimo = null;

    function onLoad(executionContext) {
        _ctx = executionContext.getFormContext();
        var c = CONFIG.campos;
        [c.quarto, c.entrada, c.saida, c.status].forEach(function (nome) {
            var attr = _ctx.getAttribute(nome);
            if (attr) {
                attr.addOnChange(agendar);
            } else {
                console.warn("HS.Reserva: campo não encontrado no formulário: " + nome);
            }
        });
        atualizarVisibilidade();
        agendar();
    }

    function agendar() {
        clearTimeout(_timer);
        _timer = setTimeout(simular, 300);
    }

    function ehPendente() {
        var opt = _ctx.getAttribute(CONFIG.campos.status).getSelectedOption();
        return !!opt && opt.text === CONFIG.textoStatusPendente;
    }

    function atualizarVisibilidade() {
        var pendente = ehPendente();
        definirSecao(CONFIG.controles.secaoSimulacao, pendente);
        definirSecao(CONFIG.controles.secaoDiarias, !pendente);
    }

    function definirSecao(nome, visivel) {
        _ctx.ui.tabs.forEach(function (tab) {
            tab.sections.forEach(function (sec) {
                if (sec.getName() === nome) sec.setVisible(visivel);
            });
        });
    }

    function chave(d) {
        var m = ("0" + (d.getMonth() + 1)).slice(-2);
        var dia = ("0" + d.getDate()).slice(-2);
        return d.getFullYear() + "-" + m + "-" + dia;
    }
    function utc(k) {
        var p = k.split("-");
        return Date.UTC(+p[0], +p[1] - 1, +p[2]);
    }
    function listarNoites(kEntrada, kSaida) {
        var dias = [];
        for (var t = utc(kEntrada); t < utc(kSaida); t += 86400000) {
            dias.push(new Date(t).toISOString().substring(0, 10));
        }
        return dias;
    }
    function formatarData(k) {
        var p = k.split("-");
        return p[2] + "/" + p[1] + "/" + p[0];
    }
    function agruparPeriodos(dias) {
        var out = [], ini = null, ant = null;
        dias.forEach(function (d) {
            if (ini === null) { ini = d; ant = d; return; }
            if (utc(d) - utc(ant) === 86400000) { ant = d; return; }
            out.push([ini, ant]); ini = d; ant = d;
        });
        if (ini !== null) out.push([ini, ant]);
        return out.map(function (p) {
            return p[0] === p[1] ? formatarData(p[0]) : formatarData(p[0]) + " a " + formatarData(p[1]);
        });
    }

    function simular() {
        atualizarVisibilidade();
        if (!ehPendente()) return;

        var c = CONFIG.campos;
        var quarto = _ctx.getAttribute(c.quarto).getValue();
        var entrada = _ctx.getAttribute(c.entrada).getValue();
        var saida = _ctx.getAttribute(c.saida).getValue();

        if (!quarto || !quarto.length || !entrada || !saida) {
            limparValores();
            return renderizar({ estado: "info", mensagens: [{ tipo: "info", texto: "Preencha Quarto, Data de Entrada e Data de Saída para simular as tarifas." }], linhas: [] });
        }

        var kEntrada = chave(entrada), kSaida = chave(saida);
        if (utc(kSaida) <= utc(kEntrada)) {
            limparValores();
            return renderizar({ estado: "erro", mensagens: [{ tipo: "erro", texto: "A Data de Saída deve ser posterior à Data de Entrada." }], linhas: [] });
        }

        var id = ++_seq;
        var quartoId = quarto[0].id.replace(/[{}]/g, "");
        var q = CONFIG.quarto, t = CONFIG.tarifa;

        Xrm.WebApi.retrieveRecord(q.tabela, quartoId, "?$select=_" + q.lookupTipoQuarto + "_value")
            .then(function (rq) {
                var tipoId = rq["_" + q.lookupTipoQuarto + "_value"];
                if (!tipoId) throw new Error("O quarto selecionado não possui Tipo de Quarto.");
                var ultimaNoite = new Date(utc(kSaida) - 86400000).toISOString().substring(0, 10);
                var filtro = "_" + t.lookupTipoQuarto + "_value eq " + tipoId +
                    " and statecode eq 0" +
                    " and " + t.inicio + " le " + ultimaNoite +
                    " and " + t.fim + " ge " + kEntrada;
                if (t.filtrarTarifaVigente) filtro += " and " + t.campoVigente + " eq true";
                var query = "?$select=" + [t.id, t.codigo, t.valor, t.inicio, t.fim].join(",") +
                    "&$filter=" + filtro +
                    "&$orderby=" + t.inicio + " desc";
                return Xrm.WebApi.retrieveMultipleRecords(t.tabela, query);
            })
            .then(function (res) {
                if (id !== _seq) return;
                processar(res.entities, kEntrada, kSaida);
            })
            .catch(function (e) {
                if (id !== _seq) return;
                limparValores();
                renderizar({ estado: "erro", mensagens: [{ tipo: "erro", texto: "Erro ao consultar tarifas: " + (e.message || e) }], linhas: [] });
            });
    }

    function processar(tarifas, kEntrada, kSaida) {
        var t = CONFIG.tarifa;
        var noites = listarNoites(kEntrada, kSaida);
        var linhas = [], faltantes = [], sobrepostas = [], total = 0, primeira = null;

        noites.forEach(function (dia) {
            var candidatas = tarifas.filter(function (x) {
                return x[t.inicio].substring(0, 10) <= dia && x[t.fim].substring(0, 10) >= dia;
            });
            if (candidatas.length === 0) {
                faltantes.push(dia);
                linhas.push({ data: formatarData(dia), tarifa: "—", valor: null, faltante: true });
                return;
            }
            if (candidatas.length > 1) sobrepostas.push(dia);
            var escolhida = candidatas[0];
            if (!primeira) primeira = escolhida;
            total += escolhida[t.valor];
            linhas.push({ data: formatarData(dia), tarifa: escolhida[t.codigo] || "(sem código)", valor: escolhida[t.valor], faltante: false });
        });

        var mensagens = [];
        var estado = "ok";
        if (tarifas.length === 0) {
            estado = "erro";
            mensagens.push({ tipo: "erro", texto: "Nenhuma tarifa ativa encontrada para este tipo de quarto no período informado. Cadastre uma tarifa antes de confirmar a reserva." });
        } else if (faltantes.length > 0) {
            estado = "erro";
            mensagens.push({ tipo: "erro", texto: "Não existe tarifa ativa para: " + agruparPeriodos(faltantes).join("; ") + ". Cadastre uma tarifa para este tipo de quarto nesse período antes de confirmar." });
        }
        if (sobrepostas.length > 0) {
            mensagens.push({ tipo: "aviso", texto: "Há mais de uma tarifa ativa em: " + agruparPeriodos(sobrepostas).join("; ") + ". Foi usada a de início mais recente. Revise o cadastro de tarifas." });
        }

        var completo = faltantes.length === 0 && tarifas.length > 0;
        var c = CONFIG.campos;
        if (completo) {
            var media = Math.round((total / noites.length) * 100) / 100;
            definir(c.valorTotal, Math.round(total * 100) / 100);
            definir(c.valorDiaria, media);
            if (primeira) {
                var lk = _ctx.getAttribute(c.tarifa);
                lk.setValue([{ id: primeira[t.id], name: primeira[t.codigo], entityType: t.tabela }]);
                lk.setSubmitMode("always");
            }
        } else {
            limparValores();
        }

        renderizar({
            estado: estado,
            mensagens: mensagens,
            linhas: linhas,
            noites: noites.length,
            total: completo ? total : null,
            media: completo ? total / noites.length : null
        });
    }

    function definir(nome, valor) {
        var a = _ctx.getAttribute(nome);
        if (!a) return;
        a.setValue(valor);
        a.setSubmitMode("always");
    }

    function limparValores() {
        var c = CONFIG.campos;
        [c.valorTotal, c.valorDiaria, c.tarifa].forEach(function (n) {
            var a = _ctx.getAttribute(n);
            if (a) { a.setValue(null); a.setSubmitMode("always"); }
        });
    }

    function renderizar(dados, tentativa) {
        _ultimo = dados;
        tentativa = tentativa || 0;
        var ctrl = _ctx.getControl(CONFIG.controles.webResource);
        if (!ctrl) return;
        ctrl.getContentWindow().then(function (win) {
            if (win && win.HSSimulacao && typeof win.HSSimulacao.render === "function") {
                win.HSSimulacao.render(_ultimo);
            } else if (tentativa < 15) {
                setTimeout(function () { renderizar(_ultimo, tentativa + 1); }, 400);
            }
        }, function () {
            if (tentativa < 15) setTimeout(function () { renderizar(_ultimo, tentativa + 1); }, 400);
        });
    }

    return { onLoad: onLoad };
})();
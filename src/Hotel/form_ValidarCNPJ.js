var ValidacaoCNPJ = (function () {

    function valorCaractere(caractere) {
        return caractere.charCodeAt(0) - 48;
    }

    function validarCNPJ(cnpj) {
        cnpj = cnpj.toUpperCase().replace(/[^0-9A-Z]/g, "");

        if (cnpj.length !== 14) return false;
        if (/^([0-9A-Z])\1{13}$/.test(cnpj)) return false;

        var pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        var pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

        var base = cnpj.substring(0, 12);
        var dv1Esperado = parseInt(cnpj.charAt(12));
        var dv2Esperado = parseInt(cnpj.charAt(13));

        var soma = 0;
        for (var i = 0; i < 12; i++) {
            soma += valorCaractere(base.charAt(i)) * pesos1[i];
        }
        var resto = soma % 11;
        var dv1 = resto < 2 ? 0 : 11 - resto;
        if (dv1 !== dv1Esperado) return false;

        var base2 = base + dv1;
        soma = 0;
        for (i = 0; i < 13; i++) {
            soma += valorCaractere(base2.charAt(i)) * pesos2[i];
        }
        resto = soma % 11;
        var dv2 = resto < 2 ? 0 : 11 - resto;
        if (dv2 !== dv2Esperado) return false;

        return true;
    }

    function aplicarMascara(executionContext) {
        var formContext = executionContext.getFormContext();
        var attribute = formContext.getAttribute("hsp_cnpj");
        var valor = attribute.getValue();

        if (!valor) return;

        var limpo = valor.toUpperCase().replace(/[^0-9A-Z]/g, "").substring(0, 14);
        var mascarado = limpo
            .replace(/^([0-9A-Z]{2})([0-9A-Z])/, "$1.$2")
            .replace(/^([0-9A-Z]{2})\.([0-9A-Z]{3})([0-9A-Z])/, "$1.$2.$3")
            .replace(/^([0-9A-Z]{2})\.([0-9A-Z]{3})\.([0-9A-Z]{3})([0-9A-Z])/, "$1.$2.$3/$4")
            .replace(/^([0-9A-Z]{2})\.([0-9A-Z]{3})\.([0-9A-Z]{3})\/([0-9A-Z]{4})([0-9A-Z]{1,2})$/, "$1.$2.$3/$4-$5");

        if (mascarado !== valor) {
            attribute.setValue(mascarado);
        }
    }

    function validarOnChange(executionContext) {
        var formContext = executionContext.getFormContext();
        var attribute = formContext.getAttribute("hsp_cnpj");
        var valor = attribute.getValue();

        if (!valor) {
            formContext.getControl("hsp_cnpj").clearNotification();
            return;
        }

        if (!validarCNPJ(valor)) {
            formContext.getControl("hsp_cnpj").setNotification(
                "Inválido. Verifique os caracteres digitados.",
                "hsp_cnpj_erro"
            );
        } else {
            formContext.getControl("hsp_cnpj").clearNotification("hsp_cnpj_erro");
        }
    }

    function validarOnSave(executionContext) {
        var formContext = executionContext.getFormContext();
        var attribute = formContext.getAttribute("hsp_cnpj");
        var valor = attribute.getValue();

        if (valor && !validarCNPJ(valor)) {
            executionContext.getEventArgs().preventDefault();
            formContext.ui.setFormNotification(
                "Não é possível salvar: o CNPJ informado é inválido.",
                "ERROR",
                "cnpj_invalido"
            );
        } else {
            formContext.ui.clearFormNotification("cnpj_invalido");
        }
    }

    return {
        aplicarMascara: aplicarMascara,
        validarOnChange: validarOnChange,
        validarOnSave: validarOnSave
    };
})();
var HospedeForm = HospedeForm || {};

HospedeForm.ValidacaoCPF = (function () {

    function validarCPF(cpf) {
        cpf = cpf.replace(/[^\d]+/g, "");

        if (cpf.length !== 11) return false;

        if (/^(\d)\1{10}$/.test(cpf)) return false;

        var soma = 0;
        var resto;

        for (var i = 1; i <= 9; i++) {
            soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
        }
        resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.substring(9, 10))) return false;

        soma = 0;
        for (i = 1; i <= 10; i++) {
            soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
        }
        resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.substring(10, 11))) return false;

        return true;
    }

    function aplicarMascara(executionContext) {
        var formContext = executionContext.getFormContext();
        var attribute = formContext.getAttribute("hsp_cpf");
        var valor = attribute.getValue();

        if (!valor) return;

        var apenasNumeros = valor.replace(/\D/g, "").substring(0, 11);
        var mascarado = apenasNumeros
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

        if (mascarado !== valor) {
            attribute.setValue(mascarado);
        }
    }

    function validarOnChange(executionContext) {
        var formContext = executionContext.getFormContext();
        var attribute = formContext.getAttribute("hsp_cpf");
        var valor = attribute.getValue();

        if (!valor) {
            formContext.getControl("hsp_cpf").clearNotification();
            return;
        }

        if (!validarCPF(valor)) {
            formContext.getControl("hsp_cpf").setNotification(
                "Inválido. Verifique os números digitados.",
                "hsp_cpf_erro"
            );
        } else {
            formContext.getControl("hsp_cpf").clearNotification("hsp_cpf_erro");
        }
    }

    function validarOnSave(executionContext) {
        var formContext = executionContext.getFormContext();
        var attribute = formContext.getAttribute("hsp_cpf");
        var valor = attribute.getValue();

        if (valor && !validarCPF(valor)) {
            executionContext.getEventArgs().preventDefault();
            formContext.ui.setFormNotification(
                "Não é possível salvar: o CPF informado é inválido.",
                "ERROR",
                "cpf_invalido"
            );
        } else {
            formContext.ui.clearFormNotification("cpf_invalido");
        }
    }

    return {
        aplicarMascara: aplicarMascara,
        validarOnChange: validarOnChange,
        validarOnSave: validarOnSave
    };
})();
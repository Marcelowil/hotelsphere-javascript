var ValidacaoTelefone = (function () {

    function detectarTipo(numero) {
        if (numero.length === 11 && numero.charAt(2) === "9") return "celular";
        if (numero.length === 10) return "fixo";
        return null;
    }

    function validarTelefone(valor) {
        var numero = valor.replace(/\D/g, "");

        if (numero.length !== 10 && numero.length !== 11) return false;

        var ddd = parseInt(numero.substring(0, 2));
        if (ddd < 11 || ddd > 99) return false;

        if (numero.length === 11 && numero.charAt(2) !== "9") return false;

        if (/^(\d)\1+$/.test(numero.substring(2))) return false;

        return true;
    }

    function aplicarMascara(executionContext, nomeCampo) {
        var formContext = executionContext.getFormContext();
        var attribute = formContext.getAttribute(nomeCampo);
        var valor = attribute.getValue();

        if (!valor) return;

        var numero = valor.replace(/\D/g, "").substring(0, 11);
        var mascarado = numero;

        if (numero.length <= 10) {
            mascarado = numero
                .replace(/^(\d{2})(\d)/, "($1) $2")
                .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
        } else {
            mascarado = numero
                .replace(/^(\d{2})(\d)/, "($1) $2")
                .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
        }

        if (mascarado !== valor) {
            attribute.setValue(mascarado);
        }
    }

    function validarOnChange(executionContext, nomeCampo) {
        var formContext = executionContext.getFormContext();
        var attribute = formContext.getAttribute(nomeCampo);
        var valor = attribute.getValue();

        if (!valor) {
            formContext.getControl(nomeCampo).clearNotification();
            return;
        }

        if (!validarTelefone(valor)) {
            formContext.getControl(nomeCampo).setNotification(
                "Inválido. Verifique o DDD e a quantidade de dígitos.",
                nomeCampo + "_erro"
            );
        } else {
            formContext.getControl(nomeCampo).clearNotification(nomeCampo + "_erro");
        }
    }

    function validarOnSave(executionContext, nomeCampo) {
        var formContext = executionContext.getFormContext();
        var attribute = formContext.getAttribute(nomeCampo);
        var valor = attribute.getValue();

        if (valor && !validarTelefone(valor)) {
            executionContext.getEventArgs().preventDefault();
            formContext.ui.setFormNotification(
                "Não é possível salvar: o telefone informado em '" + nomeCampo + "' é inválido.",
                "ERROR",
                nomeCampo + "_invalido"
            );
        } else {
            formContext.ui.clearFormNotification(nomeCampo + "_invalido");
        }
    }

    function tipoDetectado(executionContext, nomeCampo) {
        var formContext = executionContext.getFormContext();
        var valor = formContext.getAttribute(nomeCampo).getValue();
        if (!valor) return null;
        return detectarTipo(valor.replace(/\D/g, ""));
    }

    return {
        aplicarMascara: aplicarMascara,
        validarOnChange: validarOnChange,
        validarOnSave: validarOnSave,
        tipoDetectado: tipoDetectado
    };
})();
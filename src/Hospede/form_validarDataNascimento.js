function validarDataNascimento(executionContext){
    var formContext = executionContext.getFormContext();
    var dataNascimento = formContext.getAttribute("hsp_datanascimento").getValue();

    if(dataNascimento > new Date()){
        var alertStrings = {
            confirmButtonLabel: "Entendido",
            text: "A data de nascimento não pode ser maior que o dia de hoje.",
            title: "Data de Nascimento inválida"
        };

        var alertOptions = {
            height: 200,
            width: 450
        };

        Xrm.Navigation.openAlertDialog(alertStrings, alertOptions).then(
            function (success) {
                formContext.getAttribute("hsp_datanascimento").setValue(null);
            }
        );
    }
}
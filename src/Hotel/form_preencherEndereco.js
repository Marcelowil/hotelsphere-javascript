function preencherEndereco(executionContext) {
    var formContext = executionContext.getFormContext();
    var cep = formContext.getAttribute("address1_postalcode").getValue();

    if(cep){
        fetch("https://viacep.com.br/ws/"+ cep.replace("-","") +"/json/")
        .then(response => response.json())
        .then(data => {
            if(data.erro !== "true"){
                formContext.getAttribute("address1_line1").setValue(data.logradouro);
                formContext.getAttribute("hsp_endereco_bairro").setValue(data.bairro);
                formContext.getAttribute("address1_city").setValue(data.localidade);
                formContext.getAttribute("address1_stateorprovince").setValue(data.estado);
                formContext.getAttribute("address1_country").setValue("Brasil");

                bloquearCampos(formContext, true);
            }
            else{
                var alertStrings = {
                    confirmButtonLabel: "Entendido",
                    text: "O CEP digitado não foi localizado",
                    title: "CEP Inválido"
                };

                var alertOptions = {
                    height: 200,
                    width: 450
                };

                Xrm.Navigation.openAlertDialog(alertStrings, alertOptions).then(
                    function (success) {
                        bloquearCampos(formContext, false);
                        limparCampos(formContext);        
                });
            }
        })
       .catch(error => console.error("Erro no CEP:", error));
    }
    else{
        limparCampos(formContext);
    }
}

function bloquearCampos(formContext, campoDesabilitado){
    formContext.getControl("address1_line1").setDisabled(campoDesabilitado);
    formContext.getControl("hsp_endereco_bairro").setDisabled(campoDesabilitado);
    formContext.getControl("address1_city").setDisabled(campoDesabilitado);
    formContext.getControl("address1_stateorprovince").setDisabled(campoDesabilitado);
    formContext.getControl("address1_country").setDisabled(campoDesabilitado);
}

function limparCampos(formContext){
    formContext.getAttribute("address1_postalcode").setValue(null);
    formContext.getAttribute("address1_line1").setValue(null);
    formContext.getAttribute("hsp_endereco_bairro").setValue(null);
    formContext.getAttribute("address1_city").setValue(null);
    formContext.getAttribute("address1_stateorprovince").setValue(null);
    formContext.getAttribute("address1_country").setValue(null);
}
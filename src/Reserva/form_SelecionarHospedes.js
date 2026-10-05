async function adicionarHospedeDoHotel(primaryControl) {
    const formContext = primaryControl;

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

    const hotelId = hotel[0].id.replace(/[{}]/g, "").toLowerCase();
    const reservaId = formContext.data.entity.getId().replace(/[{}]/g, "");

    if (!reservaId) {
        await Xrm.Navigation.openAlertDialog({ text: "Salve a reserva antes de adicionar hóspedes." });
        return;
    }

    const selecionados = await Xrm.Utility.lookupObjects({
        allowMultiSelect: true,
        defaultEntityType: "contact",
        entityTypes: ["contact"],
        disableMru: true,
        filters: [{
            entityLogicalName: "contact",
            filterXml: `<filter><condition attribute="hsp_hotel" operator="eq" value="${hotelId}"/></filter>`
        }]
    });
    if (!selecionados || selecionados.length === 0) return;

    const rejeitados = [];

    for (const h of selecionados) {
        const contactId = h.id.replace(/[{}]/g, "");

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
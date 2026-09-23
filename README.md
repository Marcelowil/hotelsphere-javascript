# HotelSphere JavaScript

JavaScript Web Resources utilizados na solução HotelSphere,
desenvolvida com Microsoft Power Platform e Dataverse.

## Objetivo

Este repositório contém os códigos JavaScript responsáveis por
comportamentos client-side dos formulários do HotelSphere.

## Responsabilidades

- Validações de interface
- Comportamento de formulários
- Exibição e ocultação de campos
- Formatação e normalização de dados
- Auxílio à experiência do usuário

## Regra arquitetural

JavaScript não é responsável por regras críticas de negócio.

Regras de integridade e negócio devem ser protegidas pelos
Plugins C# no Dataverse.

## Estrutura

```text
src/
├── Hospede/
├── Hotel/
├── Pagamento/
├── Reserva/
└── Tarifa/
```

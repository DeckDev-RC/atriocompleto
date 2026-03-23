# SL Calculadora de Precos — Documentacao Tecnica Fiel ao XLSM

Extraido de `SL_CalculadoraDePreços.xlsm`.
Esta versao descreve as formulas literais do workbook, inclusive comportamentos estranhos da planilha.

---

## Regras importantes

1. Este documento descreve o `.xlsm` como ele realmente esta montado, nao uma interpretacao "corrigida" da logica.
2. `AP1` nao usa a comissao do Mercado Livre. A formula literal referencia `Calculadora!B16`, que aponta para **Netshoes**.
3. Amazon e Magalu tem uma condicao intermediaria de peso que, do jeito que foi escrita no Excel, so aciona no caso limite de `500g`.
4. No workbook literal nao existe referencia circular no Mercado Livre. O frete dele depende de `AP1`, e `AP1` depende da comissao da Netshoes.

---

## Visao geral das abas

| Aba | Papel |
|---|---|
| `Gestao` | Parametros e formulas de frete/comissao |
| `Calculadora` | Entradas do produto e resultados por marketplace |
| `BaseProdutos` | Snapshot dos valores no momento do clique em `Registrar` |

Fluxo:

```text
Gestao -> fornece frete e comissao -> Calculadora
Calculadora -> botao Registrar -> BaseProdutos
```

---

## Aba: Gestao

### Estrutura principal

| Coluna | Conteudo |
|---|---|
| A | Marketplace |
| B | Valor de referencia |
| C | Frete minimo |
| D | Frete maximo |
| E | Frete final calculado |
| F | Comissao |
| I/K/M | Limites de peso |
| J/L/N | Valores de frete por faixa |
| P/Q/R | Parametros globais |

### Parametros globais

| Celula | Parametro | Valor |
|---|---|---|
| `Q2` | Imposto | `0,07` |
| `Q3` | Difal | `0,00` |

Esses valores entram no divisor de todos os marketplaces.

### Frete final por marketplace

#### Amazon — `Gestao!E2`

Formula literal:

```excel
=IF(Calculadora!$J$7<Gestão!I2,Gestão!J2,
  IF(AND(Calculadora!$J$7<Gestão!K2,Gestão!I2>=Calculadora!$J$7),Gestão!L2,Gestão!N2))
```

Comportamento literal:

| Caso | Resultado |
|---|---|
| `peso < 500` | `J2 = 13,45` |
| `peso = 500` | `L2 = 17,45` |
| `peso > 500` | `N2 = 19,45` |

Observacao: a segunda faixa nao cobre `501..999g`; ela so pega o caso limite de `500g`.

#### Magalu — `Gestao!E3`

Formula literal:

```excel
=IF(Calculadora!AP1<Gestão!B3,5,
  IF(Calculadora!$J$7<Gestão!I3,Gestão!J3,
    IF(AND(Calculadora!$J$7<Gestão!K3,Gestão!I3>=Calculadora!$J$7),Gestão!L3,Gestão!N3))+5)
```

Comportamento literal:

| Caso | Resultado |
|---|---|
| `AP1 < 79` | `5,00` |
| `AP1 >= 79` e `peso < 500` | `17,95 + 5,00 = 22,95` |
| `AP1 >= 79` e `peso = 500` | `20,45 + 5,00 = 25,45` |
| `AP1 >= 79` e `peso > 500` | `21,45 + 5,00 = 26,45` |

De novo: a faixa intermediaria so cobre `500g` exatos por causa da condicao literal da planilha.

#### Mercado Livre — `Gestao!E4`

Formula literal:

```excel
=IF(Calculadora!AP1>200,
IF(Calculadora!J7/1000<=0.3,19.95,
IF(Calculadora!J7/1000<=0.5,21.45,
IF(Calculadora!J7/1000<=1,22.45,
IF(Calculadora!J7/1000<=2,23.45,
IF(Calculadora!J7/1000<=3,24.95,
IF(Calculadora!J7/1000<=4,26.95,28.45)))))),
IF(Calculadora!AP1>=150,
IF(Calculadora!J7/1000<=0.3,17.96,
IF(Calculadora!J7/1000<=0.5,19.31,
IF(Calculadora!J7/1000<=1,20.21,
IF(Calculadora!J7/1000<=2,21.11,
IF(Calculadora!J7/1000<=3,22.46,
IF(Calculadora!J7/1000<=4,24.26,25.61)))))),
IF(Calculadora!AP1>=120,
IF(Calculadora!J7/1000<=0.3,15.96,
IF(Calculadora!J7/1000<=0.5,17.16,
IF(Calculadora!J7/1000<=1,17.96,
IF(Calculadora!J7/1000<=2,18.76,
IF(Calculadora!J7/1000<=3,19.96,
IF(Calculadora!J7/1000<=4,21.56,22.76)))))),
IF(Calculadora!AP1>=100,
IF(Calculadora!J7/1000<=0.3,13.97,
IF(Calculadora!J7/1000<=0.5,15.02,
IF(Calculadora!J7/1000<=1,15.72,
IF(Calculadora!J7/1000<=2,16.42,
IF(Calculadora!J7/1000<=3,17.47,
IF(Calculadora!J7/1000<=4,18.87,19.92)))))),
IF(Calculadora!AP1>=79,
IF(Calculadora!J7/1000<=0.3,11.97,
IF(Calculadora!J7/1000<=0.5,12.87,
IF(Calculadora!J7/1000<=1,13.47,
IF(Calculadora!J7/1000<=2,14.07,
IF(Calculadora!J7/1000<=3,14.97,
IF(Calculadora!J7/1000<=4,16.17,17.07)))))),
6.75)))))
```

`AP1` e a base usada para decidir a faixa de preco. `J7/1000` converte peso para kg.

Tabela equivalente:

| Faixa por `AP1` | <= 0,3 kg | <= 0,5 kg | <= 1 kg | <= 2 kg | <= 3 kg | <= 4 kg | > 4 kg |
|---|---|---|---|---|---|---|---|
| `> 200` | 19,95 | 21,45 | 22,45 | 23,45 | 24,95 | 26,95 | 28,45 |
| `>= 150` | 17,96 | 19,31 | 20,21 | 21,11 | 22,46 | 24,26 | 25,61 |
| `>= 120` | 15,96 | 17,16 | 17,96 | 18,76 | 19,96 | 21,56 | 22,76 |
| `>= 100` | 13,97 | 15,02 | 15,72 | 16,42 | 17,47 | 18,87 | 19,92 |
| `>= 79` | 11,97 | 12,87 | 13,47 | 14,07 | 14,97 | 16,17 | 17,07 |
| `< 79` | 6,75 | 6,75 | 6,75 | 6,75 | 6,75 | 6,75 | 6,75 |

#### Netshoes

Frete:

```excel
Gestao!E5 = 0
```

Comissao dinamica:

```excel
Gestao!F5 = IF(Calculadora!AP2<150,0.26,0.31)
```

#### Shein

Formula literal:

```excel
=IF(Calculadora!AQ5>Gestão!B6,Gestão!D6,Gestão!C6)
```

No workbook atual:

| Celula | Valor |
|---|---|
| `B6` | `0` |
| `C6` | `5` |
| `D6` | `5` |

Logo, o resultado visivel e sempre `5,00`.

#### Shopee

Formula literal:

```excel
=IF(Calculadora!AQ6>Gestão!B7,Gestão!D7,Gestão!C7)
```

No workbook atual:

| Celula | Valor |
|---|---|
| `B7` | `0` |
| `C7` | `4` |
| `D7` | `4` |

Logo, o resultado visivel e sempre `4,00`.

---

## Aba: Calculadora

### Entradas principais

| Celula | Campo |
|---|---|
| `B7` | Produto |
| `J7` | Peso (g) |
| `N7` | Custo |
| `S7` | Custo Operacional |
| `Y7` | Margem |

### Celulas auxiliares

#### `AP1`

Formula literal:

```excel
=IF(OR(AND($N$7="",$S$7=""),AND($N$7=0,$S$7=0)),0,
  1*($N$7+$S$7)/(1-(Gestão!$Q$2+Gestão!$Q$3+VLOOKUP(Calculadora!B16,Gestão!A:F,6,0)+$Y$7)))
```

Observacao importante:

- `Calculadora!B16` e o texto `Netshoes`.
- Portanto, `AP1` usa a comissao obtida na linha da Netshoes em `Gestao!F5`.
- E essa mesma `AP1` alimenta o frete de Magalu e Mercado Livre.

Em termos praticos:

```text
AP1 = (custo + custoOperacional) /
      (1 - imposto - difal - comissaoDaNetshoes - margem)
```

#### `AP2`

Formula literal:

```excel
=IF(OR(AND($N$7="",$S$7=""),AND($N$7=0,$S$7=0)),0,
  1*($N$7+$S$7)/(1-(Gestão!$Q$2+Gestão!$Q$3+0.26+$Y$7)))
```

Uso:

```text
AP2 -> decide se Gestao!F5 sera 26% ou 31%
```

#### `AQ5` e `AQ6`

Formulas literais:

```excel
AQ5 = ($N$7+$S$7)+(($N$7+$S$7)*Gestão!Q7)+(($N$7+$S$7)*Gestão!Q8)+(VLOOKUP(B17,Gestão!A:F,6,0)*($N$7+$S$7))
AQ6 = ($N$7+$S$7)+(($N$7+$S$7)*Gestão!Q8)+(($N$7+$S$7)*Gestão!Q9)+(VLOOKUP(B18,Gestão!A:F,6,0)*($N$7+$S$7))
```

No workbook atual, como `Gestao!C6 = D6 = 5` e `Gestao!C7 = D7 = 4`, essas auxiliares nao mudam o valor final visivel do frete.

#### `AN1:AN4` e `AO1`

Essas celulas existem no workbook, mas nao entram diretamente nas formulas finais de preco praticado, preco cheio ou lucro.

### Tabela de resultados

| Linha | Marketplace | Desconto promocional |
|---|---|---|
| 13 | Amazon | 20% |
| 14 | Magalu | 20% |
| 15 | Mercado Livre | 12% |
| 16 | Netshoes | 20% |
| 17 | Shein | 25% |
| 18 | Shopee | 40% |

### Preco praticado

Formula literal da linha Amazon (`S13`):

```excel
=IF(OR(AND($N$7="",$S$7=""),AND($N$7=0,$S$7=0)),0,
  1*($N$7+$S$7+VLOOKUP(B13,Gestão!A:E,5,0))/
  (1-(Gestão!$Q$2+Gestão!$Q$3+VLOOKUP(Calculadora!B13,Gestão!A:F,6,0)+$Y$7)))
```

Padrao das linhas `S13:S18`:

```text
PrecoPraticado = (custo + custoOperacional + frete) /
                 (1 - imposto - difal - comissao - margem)
```

O guarda inicial retorna `0` quando `custo = 0` e `custoOperacional = 0`.

### Preco cheio

Formula padrao:

```text
PrecoCheio = PrecoPraticado / (1 - descontoPromocional)
```

Exemplos literais:

```excel
M13 = S13 / (1 - G13)
M14 = S14 / (1 - G14)
...
M18 = S18 / (1 - G18)
```

### Lucro

Formula literal da linha Amazon (`Y13`):

```excel
=$S13-$S$7-$N$7-(Gestão!$Q$2*S13)-(Gestão!$Q$3*S13)-(Gestão!F2*S13)-Gestão!E2
```

Forma equivalente:

```text
Lucro = PrecoPraticado
        - custoOperacional
        - custo
        - (imposto  * PrecoPraticado)
        - (difal    * PrecoPraticado)
        - (comissao * PrecoPraticado)
        - frete
```

---

## Macro VBA: CopiarParaBaseProdutos

Codigo extraido do workbook:

```vb
Sub CopiarParaBaseProdutos()

    Dim wsCalc    As Worksheet
    Dim wsBase    As Worksheet
    Dim wsGestao  As Worksheet
    Dim ultimaLinha   As Long
    Dim fatorImpostos As Double
    Dim fretes    As Variant

    Set wsCalc   = ThisWorkbook.Sheets("Calculadora")
    Set wsBase   = ThisWorkbook.Sheets("BaseProdutos")
    Set wsGestao = ThisWorkbook.Sheets("Gestão")

    fatorImpostos = wsGestao.Range("Q2").Value    ' 0,07 (7%)
    fretes        = wsGestao.Range("E2:E7").Value ' frete calculado de cada marketplace

    ultimaLinha = wsBase.Cells(wsBase.Rows.Count, "A").End(xlUp).Row + 1

    ' --- Dados do produto (colunas A-E) ---
    wsBase.Cells(ultimaLinha, 1) = wsCalc.Range("B7")  ' Produto
    wsBase.Cells(ultimaLinha, 2) = wsCalc.Range("J7")  ' Peso (g)
    wsBase.Cells(ultimaLinha, 3) = wsCalc.Range("N7")  ' Custo
    wsBase.Cells(ultimaLinha, 4) = wsCalc.Range("S7")  ' Custo Operacional
    wsBase.Cells(ultimaLinha, 5) = wsCalc.Range("Y7")  ' Margem

    ' --- Precos Praticados (colunas F-K) ---
    wsBase.Cells(ultimaLinha, 6)  = wsCalc.Range("S13") ' PP Amazon
    wsBase.Cells(ultimaLinha, 7)  = wsCalc.Range("S14") ' PP Magalu
    wsBase.Cells(ultimaLinha, 8)  = wsCalc.Range("S15") ' PP Mercado Livre
    wsBase.Cells(ultimaLinha, 9)  = wsCalc.Range("S16") ' PP Netshoes
    wsBase.Cells(ultimaLinha, 10) = wsCalc.Range("S17") ' PP Shein
    wsBase.Cells(ultimaLinha, 11) = wsCalc.Range("S18") ' PP Shopee

    ' --- Impostos = PP x 7% (colunas L-Q) ---
    For i = 6 To 11
        If IsNumeric(wsBase.Cells(ultimaLinha, i).Value) Then
            wsBase.Cells(ultimaLinha, i + 6) = wsBase.Cells(ultimaLinha, i) * fatorImpostos
        Else
            wsBase.Cells(ultimaLinha, i + 6) = 0
        End If
    Next i

    ' --- Fretes calculados da Gestao!E2:E7 (colunas R-W) ---
    For i = 1 To 6
        If IsNumeric(fretes(i, 1)) Then
            wsBase.Cells(ultimaLinha, 17 + i) = fretes(i, 1)
        Else
            wsBase.Cells(ultimaLinha, 17 + i) = 0
        End If
    Next i

    MsgBox "Produto adicionado com sucesso na BaseProdutos!", vbInformation

End Sub
```

### O que a macro grava

| Coluna | Conteudo |
|---|---|
| A-E | Dados de entrada do produto |
| F-K | Precos praticados por marketplace |
| L-Q | Imposto calculado como `PrecoPraticado * 0,07` |
| R-W | Snapshot dos fretes calculados em `Gestao!E2:E7` |

Importante: a `BaseProdutos` armazena valores, nao formulas. Registros antigos nao sao recalculados se a `Gestao` mudar depois.

---

## Aba: BaseProdutos

Schema observado:

```text
A  produto
B  pesoGramas
C  custo
D  custoOperacional
E  margem
F  ppAmazon
G  ppMagalu
H  ppMercadoLivre
I  ppNetshoes
J  ppShein
K  ppShopee
L  impAmazon
M  impMagalu
N  impMercadoLivre
O  impNetshoes
P  impShein
Q  impShopee
R  freteAmazon
S  freteMagalu
T  freteMercadoLivre
U  freteNetshoes
V  freteShein
W  freteShopee
```

---

## Exemplo real do workbook: Camisa Preta

Entradas:

| Campo | Valor |
|---|---|
| Produto | Camisa Preta |
| Peso | 499 g |
| Custo | 45,00 |
| Custo Operacional | 4,00 |
| Margem | 0,10 |
| Imposto | 0,07 |
| Difal | 0,00 |

Celulas auxiliares:

| Celula | Valor |
|---|---|
| `AP2` | `85,96491228070177` |
| `F5` | `0,26` |
| `AP1` | `85,96491228070177` |

Fretes calculados:

| Marketplace | Valor |
|---|---|
| Amazon | `13,45` |
| Magalu | `22,95` |
| Mercado Livre | `12,87` |
| Netshoes | `0,00` |
| Shein | `5,00` |
| Shopee | `4,00` |

Precos praticados:

| Marketplace | Valor bruto | Valor exibido |
|---|---|---|
| Amazon | `91,83823529411767` | `91,84` |
| Magalu | `107,38805970149255` | `107,39` |
| Mercado Livre | `89,66666666666667` | `89,67` |
| Netshoes | `85,96491228070177` | `85,96` |
| Shein | `80,59701492537314` | `80,60` |
| Shopee | `84,12698412698413` | `84,13` |

Precos cheios:

| Marketplace | Valor bruto | Valor exibido |
|---|---|---|
| Amazon | `114,79779411764707` | `114,80` |
| Magalu | `134,23507462686567` | `134,24` |
| Mercado Livre | `101,89393939393940` | `101,89` |
| Netshoes | `107,45614035087720` | `107,46` |
| Shein | `107,46268656716420` | `107,46` |
| Shopee | `140,21164021164023` | `140,21` |

Lucro:

| Marketplace | Valor bruto | Valor exibido |
|---|---|---|
| Amazon | `9,183823529411779` | `9,18` |
| Magalu | `10,738805970149269` | `10,74` |
| Mercado Livre | `8,966666666666667` | `8,97` |
| Netshoes | `8,596491228070185` | `8,60` |
| Shein | `8,059701492537322` | `8,06` |
| Shopee | `8,412698412698411` | `8,41` |

---

## Resumo operacional

Se voce quiser reproduzir o workbook exatamente, as regras criticas sao estas:

1. Calcule `AP2` com comissao fixa de `26%`.
2. Use `AP2` para definir a comissao da Netshoes em `26%` ou `31%`.
3. Calcule `AP1` usando essa comissao da Netshoes.
4. Use `AP1` para decidir o frete de Magalu e Mercado Livre.
5. Depois calcule `S13:S18`, `M13:M18` e `Y13:Y18` com as formulas padrao.

Esse e o comportamento literal do `.xlsm`.

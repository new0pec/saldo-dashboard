# Saldo — Finanças

Dashboard pessoal de finanças ao estilo iOS 27 (Liquid Glass, fundo "Pôr do sol"). Lê a exportação mais recente do **MoneyStats** numa pasta do teu Dropbox e mostra:

- Saldo líquido, receitas e despesas do ano ou de cada mês, com anel da percentagem da receita gasta e comparação com o mês anterior
- Gráfico mensal de receitas e despesas (toque num mês para o abrir)
- Gastos por grupo — Alimentação, Casa e contas, Transportes e viagens, Tecnologia, Subscrições, Compras, Saúde, Família, Créditos e impostos, Educação, Investimentos, Pessoas (MbWay)
- Categorias, saldo calculado por conta e lista de movimentos com pesquisa
- Botão **Atualizar** para ir buscar o ficheiro mais recente da pasta
- Instalável no ecrã principal do iPhone (Safari → Partilhar → Adicionar ao ecrã principal)

Os dados nunca saem do teu dispositivo: a página fala diretamente com o Dropbox a partir do browser e guarda apenas uma cópia local para abrir mais depressa. O código não contém chaves nem dados.

## Publicar no GitHub Pages

1. No repositório, abre **Settings → Pages**.
2. Em **Source**, escolhe **Deploy from a branch**, ramo `main`, pasta `/ (root)`, e guarda.
3. Ao fim de um minuto a página fica em `https://<utilizador>.github.io/<repositório>/`.

## Ligar ao Dropbox (uma vez)

1. Abre <https://www.dropbox.com/developers/apps> e clica em **Create app**.
2. Escolhe **Scoped access** e **Full Dropbox**, e dá-lhe um nome (por exemplo `saldo-<o-teu-nome>`).
3. No separador **Permissions**, marca `files.metadata.read` e `files.content.read` e clica em **Submit**.
4. No separador **Settings**:
   - em **OAuth 2 → Redirect URIs**, adiciona o endereço exato da página, por exemplo `https://new0pec.github.io/saldo-dashboard/` (a página mostra-o nas Definições);
   - em **Allow public clients (Implicit Grant & PKCE)**, escolhe **Allow**;
   - copia a **App key** (a App secret não é precisa).
5. Abre a página, toca no ícone de definições, cola a App key, confirma a pasta (por omissão `/Claudee`) e toca em **Guardar e ligar**.

A ligação usa OAuth com PKCE e só tem permissão de leitura. Para a revogar: Definições → **Desligar**, ou em <https://www.dropbox.com/account/connected_apps>.

Sem Dropbox, também podes usar **Abrir ficheiro** para carregar uma exportação guardada no dispositivo.

## Formato do ficheiro

Exportação CSV do MoneyStats (`.txt` ou `.csv`) com o cabeçalho `"Conta","Data","Montante",…,"Categoria","Comentário","Hashtags",…`. Datas `DD/MM/AAAA`, montantes com vírgula decimal. Se a pasta tiver vários ficheiros, é usado o `.txt`/`.csv` alterado mais recentemente.

## Como são calculados os números

- Receitas e despesas excluem transferências entre contas próprias (Revolut, Conta Main, C.C.ActivoBank, C.C.WiZink, Trade Republic, Transferência) e acertos de saldo (Ajuste, Saldo Positivo, Saldo Negativo).
- Prestações de crédito e comissões bancárias contam como despesas.
- O saldo de cada conta é a soma de todos os movimentos do ficheiro e pode diferir do saldo real no banco.
- Os emojis dos nomes das categorias são removidos. Uma categoria nova que não esteja em nenhum grupo aparece em **Outros** — para a atribuir, acrescenta-a ao objeto `GRUPOS` em `app.js`.

## Ficheiros

- `index.html` — estrutura e estilos
- `app.js` — leitura do Dropbox, cálculos e gráficos (usa [d3](https://d3js.org) via jsDelivr)
- `favicon.svg`, `manifest.webmanifest` — ícone e instalação como app

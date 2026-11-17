# SPTrans · Visualizador do Olho Vivo

Projeto local em **Python + Flask + JavaScript**, com mapa interativo dos ônibus de São Paulo. O token fornecido já está configurado no arquivo `.env`; ele é lido pelo Python e não é enviado ao navegador.

## Começar no Windows

1. Extraia o ZIP inteiro para uma pasta, por exemplo `C:\Users\jimak\dev\sptrans-visualizador`.
2. Tenha **Python 3.10 ou superior** instalado, com a opção **Add Python to PATH** marcada.
3. Abra a pasta extraída e dê dois cliques em **`iniciar.bat`**. A primeira execução cria o ambiente virtual e instala as dependências.
4. Mantenha a janela aberta e acesse **http://127.0.0.1:5000** no navegador.

Se preferir executar pelo terminal do VS Code, abra o PowerShell na pasta do projeto:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

Esses comandos usam o Python do ambiente virtual diretamente e dispensam a ativação de scripts no PowerShell. Para encerrar o servidor, pressione `Ctrl+C` no terminal.

## Linux e macOS

Na pasta do projeto, execute:

```bash
bash iniciar.sh
```

Se faltar o módulo `venv` no Linux, instale o pacote de ambiente virtual correspondente à sua versão do Python. Depois abra http://127.0.0.1:5000.

## O que você pode visualizar

| Recurso | Como usar |
| --- | --- |
| Ônibus no mapa | O monitoramento consulta as últimas posições informadas pela SPTrans. |
| Linhas | Pesquise um número ou nome, por exemplo `8000` ou `Lapa`, e escolha um sentido. |
| Paradas | Pesquise nome/endereço ou consulte as paradas de uma linha ou corredor. |
| Previsões | Selecione uma parada para consultar os horários previstos pela API. |
| Corredores | Liste os corredores e consulte suas paradas. |
| Empresas e garagens | Use o explorador para consultar operadoras e veículos nas garagens. |
| Velocidade nas vias | Baixe os arquivos KMZ de fluidez pelo explorador e abra em um programa compatível, como Google Earth. |
| Exportação | Baixe os veículos exibidos em CSV ou o retorno da consulta em JSON. |
| Atualização | Ative a consulta automática a cada 30 segundos ou atualize manualmente. |
| Demonstração | Use dados ilustrativos para conhecer a interface sem depender da API. A tela identifica esse modo explicitamente. |

Os marcadores representam **posições de veículos e paradas**, não o desenho do trajeto das linhas. Os horários de captura são exibidos no fuso de São Paulo. Os dados não são gravados em um histórico: os downloads exportam a consulta atual.

## Onde alterar o código

| Arquivo | Responsabilidade |
| --- | --- |
| `app.py` | Servidor Flask, página inicial e rotas locais `/api/...`. |
| `sptrans_client.py` | Autenticação, sessão com cookies e chamadas HTTPS à SPTrans. |
| `templates/index.html` | Estrutura da página. |
| `static/app.js` | Consultas, mapa, filtros e exportações. |
| `static/styles.css` | Cores, espaçamento e adaptação para celular. |
| `static/demo-data.js` | Exemplos identificados como demonstração. |
| `.env` | Token e configuração local. |
| `.env.example` | Modelo sem credencial para configurar outra instalação. |
| `tests/test_app.py` | Testes de autenticação, falhas e validação das consultas. |

O navegador acessa o Flask, que autentica na SPTrans e reaproveita o cookie de sessão. Isso mantém a credencial no servidor e evita chamadas diretas entre o navegador e o domínio externo. O servidor inicia apenas no próprio computador (`127.0.0.1`), com depuração desativada.

## Consultas locais

As respostas JSON preservam os nomes de campos usados pela SPTrans.

| URL local | Consulta |
| --- | --- |
| `/api/status` | Verificar configuração e autenticação. |
| `/api/linhas?q=8000` | Buscar linhas; `sentido=1` ou `2` é opcional. |
| `/api/posicoes` | Últimas posições de todos os veículos disponíveis. |
| `/api/posicoes?codigo_linha=1273` | Veículos de um código de linha e sentido. |
| `/api/paradas?q=Afonso` | Buscar paradas por nome/endereço. |
| `/api/paradas?codigo_linha=1273` | Paradas de uma linha. |
| `/api/paradas?codigo_corredor=8` | Paradas de um corredor. |
| `/api/previsoes?codigo_parada=340015329` | Previsões de uma parada. |
| `/api/previsoes?codigo_linha=1273` | Previsões de uma linha. |
| `/api/previsoes?codigo_parada=340015329&codigo_linha=1273` | Previsão de uma linha em uma parada. |
| `/api/corredores` | Corredores disponíveis. |
| `/api/empresas` | Operadoras por área. |
| `/api/garagens?codigo_empresa=999` | Veículos na garagem; `codigo_linha` é opcional. |
| `/api/velocidades?tipo=geral` | Download KMZ; tipo também pode ser `corredor` ou `outras`, com `sentido=BC` ou `CB` opcional. |

Os códigos acima são **exemplos**, não garantem veículos ou previsões disponíveis. Use os códigos retornados pelas buscas na sua consulta. `cl` é o identificador interno da linha **por sentido**; ele não é o número exibido no ônibus, como `8000-10`.

## Configuração e problemas comuns

- **Token:** edite `SPTRANS_TOKEN` no `.env` e reinicie o servidor. O `.gitignore` já exclui esse arquivo; remova a credencial antes de compartilhar o ZIP ou a pasta.
- **Porta ocupada:** altere `PORT=5000` para `PORT=5001` no `.env`, reinicie e acesse http://127.0.0.1:5001. Os iniciadores mostram o endereço padrão; use a porta configurada.
- **Falha de autenticação:** confirme se o token está ativo na área de desenvolvedores da SPTrans e se a conexão permite acessar o serviço por HTTPS.
- **Tempo esgotado ou serviço indisponível:** tente novamente mais tarde. O painel mostra a falha e permite escolher a demonstração; ele não substitui dados reais por exemplos automaticamente.
- **Mapa sem fundo:** as imagens do mapa dependem de internet e do OpenStreetMap. A tabela continua disponível mesmo quando o mapa não carregar.
- **Nenhum veículo ou previsão:** pode não haver informações naquele instante, sentido ou parada. Isso não significa necessariamente erro no código.
- **Paradas incompletas:** a documentação do Olho Vivo limita a categoria de paradas às paradas de corredores. Um catálogo completo de itinerários e paradas exige os dados estáticos GTFS, que não fazem parte deste projeto.

## Executar os testes

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

Os testes usam respostas simuladas para não depender da disponibilidade da SPTrans nem consumir o token.

## Referências

- [Documentação oficial da API Olho Vivo](https://www.sptrans.com.br/desenvolvedores/api-do-olho-vivo-guia-de-referencia/documentacao-api/)
- [Área de desenvolvedores da SPTrans](https://www.sptrans.com.br/desenvolvedores/)
- [Leaflet](https://leafletjs.com/) e [OpenStreetMap](https://www.openstreetmap.org/copyright)
- [Política de uso dos mapas do OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/)

O Leaflet 1.9.4 está incluído em `static/vendor/leaflet/`, com sua licença. As imagens das ruas e os rótulos são carregados pela internet a partir do OpenStreetMap, sem exigir um segundo token. A camada do mapa informa a origem real da página e respeita o cache do navegador; não há download em lote ou uso offline dos mapas.

A conexão usa a API v2.1 por **HTTPS**, conforme a atualização de protocolo da documentação oficial. As previsões e posições refletem o que o serviço informou; não são garantias de chegada. Este é um projeto independente para estudo e consulta dos dados, sem vínculo institucional com a SPTrans.

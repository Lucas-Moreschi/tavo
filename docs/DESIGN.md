# Identidade visual TAVO

Esta especificação reúne as cores, a tipografia e os controles da aplicação. O tema está implementado em CSS e não depende de arquivos do protótipo ou documentos externos.

| Uso                                     | Cor       |
| --------------------------------------- | --------- |
| Marca, ações principais e seleção ativa | `#FF782F` |
| Hover e estado pressionado              | `#FF9A57` |
| Texto sobre laranja                     | `#17110D` |
| Tags                                    | `#FFAD76` |
| Aguardando                              | `#FFB078` |
| Fundo geral                             | `#101010` |
| Navegação                               | `#111111` |
| Cartões, campos e categorias            | `#1B1B1B` |
| Cartões de mesa                         | `#191919` |
| Comanda e avisos                        | `#211A15` |
| Placeholder de fotos                    | `#25211E` |
| Bordas                                  | `#303030` |
| Bordas secundárias                      | `#353535` |
| Divisores                               | `#2B2B2B` |
| Borda quente                            | `#39312B` |
| Texto principal                         | `#F5F2EE` |
| Texto secundário                        | `#E8E3DD` |
| Texto de itens                          | `#D8D2CC` |
| Legendas                                | `#A19B95` |
| Categorias inativas                     | `#B7B0AA` |
| Quantidades e texto auxiliar            | `#AAA39D` |

Os tokens estão em `src/styles/globals.css`. Inter é a fonte da interface; Montserrat identifica a marca, com o símbolo e a assinatura “Gestão inteligente”. As fontes usam Google Fonts com fallback para fontes locais do sistema.

As regras de legibilidade e interação estão em `src/styles/controls.css`, carregado depois do tema. O texto principal usa 1 rem (16 px na configuração padrão do navegador); textos de apoio usam 14 px, rótulos de formulário e botões 15 px, campos 16 px e títulos de página de 32 a 44 px. As medidas em rem acompanham a preferência de tamanho de fonte do navegador.

Botões e campos usam cantos de 14 px, cartões de produto de 20 px. As ações principais têm altura mínima de 48 px; botões de ícone, ações secundárias e contadores oferecem áreas de pelo menos 44 px. Categorias selecionadas recebem fundo laranja e texto escuro. Interruptores usam trilho de 48 × 28 px, botão branco e uma área de interação vertical de 44 px. Estados de sucesso, informação e erro conservam cores semânticas restritas à operação.

Controles têm estados de hover, foco, pressionado e desabilitado, com sombras discretas e transições de 150–220 ms. Trocas de tela, cartões de resumo, modais, avisos e gráficos têm animações de entrada curtas. A preferência `prefers-reduced-motion` desativa essas animações e transições. A atualização periódica dos dados não remonta a tela nem reinicia as animações de entrada.

Há um atalho de teclado para pular a navegação e focar o conteúdo. Os diálogos preservam o foco e relacionam título e descrição com identificadores próprios. Os campos de celular mantêm 16 px; os formulários, cartões e áreas de ação reorganizam-se em vez de reduzir a fonte para caber.

A adaptação mantém a área ampla no desktop, navegação móvel e formulários responsivos. O fundo é liso, sem elementos decorativos ou gradientes.

O tema também se aplica aos avisos de conexão, instalação, atualização e página offline do PWA. Mudanças nos recursos estáticos de fallback exigem atualizar a versão do cache em `public/sw.js`.

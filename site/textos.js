// Textos explicativos de cada pizza. Só texto, sem números: os números vêm dos JSONs.
// "fatias" é indexado pelo nome da fatia, igual ao que o coletor grava.

export const EXPLICACOES = {
  IPCA: {
    resumo: "Para onde vai o orçamento das famílias brasileiras, segundo a inflação oficial.",
    blocos: [
      {
        titulo: "O que é o IPCA",
        texto: [
          "O Índice Nacional de Preços ao Consumidor Amplo é a inflação oficial do Brasil, medida todo mês pelo IBGE. É por ele que o Banco Central acompanha a meta de inflação.",
          "O IBGE pesquisa os preços de centenas de produtos e serviços consumidos por famílias com renda de 1 a 40 salários mínimos, nas principais áreas urbanas do país.",
        ],
      },
      {
        titulo: "O que é cada fatia",
        texto: [
          "A pizza inteira é o orçamento médio dessas famílias. Cada fatia é um dos 9 grupos do IPCA, e o tamanho dela é o peso do grupo: quanto daquele orçamento vai para ele.",
          "No detalhe da fatia aparecem a variação de preço do grupo no mês e a contribuição dele para o IPCA, que é o peso multiplicado pela variação.",
        ],
      },
      {
        titulo: "Cuidado ao ler",
        texto: [
          "Fatia grande não quer dizer que os preços subiram mais. Quer dizer que o grupo pesa mais no bolso. Um grupo pequeno com uma alta forte pode puxar o índice menos que um grupo grande com uma alta leve.",
        ],
      },
    ],
    fatias: {
      "Alimentação e bebidas": "Comida e bebida, em casa e fora de casa: supermercado, feira, restaurantes e lanches.",
      "Habitação": "Aluguel, condomínio, energia elétrica, água e esgoto, gás de cozinha, produtos de limpeza e reparos na casa.",
      "Transportes": "Combustíveis, ônibus e metrô, passagens aéreas, aplicativos, compra e manutenção de veículos.",
      "Saúde e cuidados pessoais": "Remédios, planos de saúde, consultas e exames, produtos de higiene e beleza.",
      "Despesas pessoais": "Serviços pessoais, como cabeleireiro e empregado doméstico, além de lazer, hospedagem e serviços bancários.",
      "Educação": "Mensalidades de escolas e faculdades, cursos, livros e material escolar.",
      "Vestuário": "Roupas, calçados, acessórios e joias.",
      "Comunicação": "Planos de celular, internet, TV por assinatura e aparelhos telefônicos.",
      "Artigos de residência": "Móveis, eletrodomésticos, eletrônicos, utensílios e artigos de cama, mesa e banho.",
    },
  },

  "Matriz elétrica": {
    resumo: "De onde veio a eletricidade gerada no Brasil no mês.",
    blocos: [
      {
        titulo: "O que é a matriz elétrica",
        texto: [
          "É a divisão da eletricidade produzida no país por fonte: água, sol, vento, gás, carvão, urânio e outras.",
          "Os dados são do ONS, o Operador Nacional do Sistema Elétrico, que coordena as usinas e as linhas de transmissão do Sistema Interligado Nacional. O ONS publica a geração de cada usina, hora a hora.",
        ],
      },
      {
        titulo: "O que é cada fatia",
        texto: [
          "A pizza inteira é toda a energia gerada no mês. O tamanho da fatia é a parte que cada fonte produziu.",
          "Hidráulica, solar e eólica são renováveis. As térmicas queimam combustível para gerar eletricidade, e a nuclear usa urânio.",
        ],
      },
      {
        titulo: "Cuidado ao ler",
        texto: [
          "A pizza é um retrato de um mês. A divisão muda ao longo do ano com as chuvas, que enchem os reservatórios das hidrelétricas, e com a época de ventos.",
          "Entram apenas as usinas acompanhadas pelo ONS. A geração em telhados é uma estimativa do próprio ONS, e os sistemas isolados que não se ligam à rede nacional, em partes da região Norte, ficam de fora.",
        ],
      },
    ],
    fatias: {
      "Hidráulica": "Usinas hidrelétricas, que geram energia com a força da água de rios e reservatórios.",
      "Solar": "Painéis fotovoltaicos, tanto de grandes usinas quanto de telhados e pequenas instalações (a geração distribuída).",
      "Eólica": "Turbinas movidas pelo vento, a maior parte no Nordeste.",
      "Gás natural": "Usinas térmicas que queimam gás natural.",
      "Nuclear": "As usinas de Angra dos Reis, no Rio de Janeiro, que usam urânio.",
      "Carvão": "Usinas térmicas a carvão mineral.",
      "Outras térmicas": "Usinas a óleo combustível, diesel, biomassa, resíduos industriais e as que usam mais de um combustível.",
    },
  },

  CPIs: {
    resumo: "Como terminaram as Comissões Parlamentares de Inquérito da Câmara dos Deputados.",
    blocos: [
      {
        titulo: "O que é uma CPI",
        texto: [
          "Uma Comissão Parlamentar de Inquérito é um grupo de parlamentares criado para investigar um fato determinado, por um prazo certo. Na Câmara, ela nasce de um pedido assinado por pelo menos um terço dos deputados.",
          "A CPI pode ouvir testemunhas, convocar autoridades e pedir a quebra de sigilos. Ela não julga nem pune ninguém: no fim, vota um relatório com as conclusões, que pode ser enviado ao Ministério Público e a outros órgãos.",
        ],
      },
      {
        titulo: "O que é cada fatia",
        texto: [
          "A pizza inteira são as CPIs da Câmara criadas desde 2015. Cada fatia junta as que tiveram o mesmo desfecho, segundo os registros oficiais da Câmara.",
          "No detalhe da fatia aparece a lista das CPIs, com as datas e o trecho do registro que mostra a aprovação do relatório, quando houver.",
        ],
      },
      {
        titulo: "Cuidado ao ler",
        texto: [
          "A pizza mostra como terminou o trabalho dentro da comissão, não o que veio depois. Aprovar um relatório não garante que alguém foi processado, e não aprovar não quer dizer que nada aconteceu: a investigação pode seguir em outros órgãos.",
          "A API da Câmara não tem um campo de desfecho. Quando o registro está incompleto, a CPI aparece como \"sem relatório registrado na API\", em vez de receber um desfecho presumido.",
        ],
      },
    ],
    fatias: {
      "Relatório final aprovado": "A comissão votou e aprovou o relatório final, com as conclusões e os encaminhamentos.",
      "Relatório apresentado, sem aprovação registrada": "Houve relatório, mas a API não registra a aprovação. Em geral, o prazo da CPI acabou antes da votação, ou o relatório não foi votado.",
      "Sem relatório registrado na API": "A API da Câmara não tem nenhum relatório registrado para a comissão. Isso não quer dizer que não houve relatório: o registro pode estar incompleto.",
      "Criada e não instalada": "A CPI foi criada, mas nunca chegou a ser instalada, ou seja, não começou a funcionar.",
      "Em andamento": "A comissão ainda está dentro do prazo de funcionamento.",
    },
  },
};

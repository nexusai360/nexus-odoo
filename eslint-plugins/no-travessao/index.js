// Plugin ESLint local. Proibe travessao (U+2014) e en-dash (U+2013) em
// strings literais e templates do projeto. Caracteres redigiveis sempre
// com virgula ou ponto; o projeto vetou esses caracteres na raiz (vide
// CLAUDE.md).

const FORBIDDEN = /[—–]/;

module.exports = {
  rules: {
    "no-travessao": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Proibe travessao (em-dash) e en-dash em literais e templates.",
        },
        messages: {
          found:
            "Caractere proibido (travessao ou en-dash). Use virgula, ponto ou parenteses.",
        },
        schema: [],
      },
      create(context) {
        function check(node, text) {
          if (typeof text === "string" && FORBIDDEN.test(text)) {
            context.report({ node, messageId: "found" });
          }
        }
        return {
          Literal(node) {
            check(node, node.value);
          },
          TemplateElement(node) {
            check(node, node.value && node.value.raw);
          },
        };
      },
    },
  },
};

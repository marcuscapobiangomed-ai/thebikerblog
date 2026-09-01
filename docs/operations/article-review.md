# SOP — Revisão de Artigo

## Objetivo
Garantir que todo artigo publicado atenda aos padrões editoriais de transparência, precisão e rastreabilidade.

## Gatilho
Pauta aprovada, artigo concluído para revisão, ou prazo de revisão periódica vencido.

## Responsável
Gate editorial automatizado. O pipeline registra a decisão, os bloqueadores, o score e o hash do conteúdo.

## Entradas necessárias
- Rascunho do artigo
- Ficha de pesquisa com fontes registradas
- Imagens associadas (se houver)
- Dados de produto referenciados (IDs do catálogo)

## Etapas
1. Verificar conformidade com o Manual Editorial
2. Conferir cada afirmação técnica com a fonte registrada
3. Validar que preços e especificações refletem os dados do catálogo
4. Verificar separação entre análise documental e teste próprio
5. Confirmar que links afiliados têm aviso ao leitor
6. Revisar clareza, coesão e precisão
7. Aprovar automaticamente ou devolver para correção/repesquisa
8. Atualizar `reviewStatus` do artigo e registrar data da revisão

## Critérios de aprovação automatizada
- Toda afirmação tem fonte rastreável
- Preços e specs batem com o catálogo
- Método de análise declarado
- Aviso de afiliado presente
- Gate automatizado sem bloqueadores, score mínimo e recibo editorial emitido

## Evidências
- Resultado das validações determinísticas e da crítica automatizada
- Ficha de pesquisa anexada
- Data, score, hash e fontes da decisão registrados

## Prazo
Artigo novo: até 5 dias úteis. Revisão periódica: conforme frequência definida (30 a 180 dias).

## Exceções
- Notícias e lançamentos: revisão simplificada, publicar com selo "primeiras impressões"
- Correções urgentes: seguir política de correções

## Forma de registrar
Resultado no registro da campanha e no metadado do conteúdo: `ai_reviewed_by`, score final, hashes e recibo editorial.

## Resultado esperado
Artigo publicado ou atualizado dentro dos padrões editoriais, com decisão automatizada registrada.

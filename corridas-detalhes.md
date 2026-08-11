---
layout: default
title: Detalhes das corridas
description: "Informações em português sobre as corridas monitoradas pela TheBiker, com datas, categorias e fontes oficiais verificadas."
permalink: /corridas/detalhes/
audience_segment: "core_technical_cyclists"
audience_intent: "follow_market_competition"
experience_level_target: "intermediate_advanced"
brand: ""
model: ""
---

{% assign race_program = site.data["race-events"] %}
{% assign public_calendar = race_program.publicCalendar %}

<div class="race-details-page" data-race-details-page data-calendar-as-of="{{ public_calendar.asOfDate }}">
  <section class="race-details-hero">
    <div class="container">
      <span class="race-hub-kicker">TheBiker Insights · Corridas explicadas</span>
      <h1>A ficha é a fonte.<br>A informação fica aqui.</h1>
      <p>Entenda em português o que está confirmado sobre cada corrida da agenda. Se um dado ainda não foi validado, nós dizemos claramente.</p>
      <a href="{{ site.baseurl }}/corridas/">← Voltar para todas as corridas</a>
    </div>
  </section>

  <div class="container race-details-content">
    <aside class="race-details-method" aria-label="Como validamos">
      <strong>Como esta página funciona</strong>
      <p>Os detalhes abaixo vêm do mesmo snapshot que alimenta os cards. A atualização diária consulta UCI, Calendário MTB e páginas oficiais dos organizadores, valida períodos, locais, quantidades e duplicidades e só então publica.</p>
      <span>Última verificação: {{ public_calendar.generatedAt | date: "%d/%m/%Y às %H:%M UTC" }}</span>
    </aside>

    <section aria-labelledby="details-today-title">
      <div class="race-details-section-heading">
        <span>Hoje</span>
        <h2 id="details-today-title">Em disputa na data oficial</h2>
      </div>
      {% for event in public_calendar.today %}
        {% include race-detail-card.html event=event status="today" status_label="Em disputa hoje" status_copy="A data de referência do calendário está dentro do período oficial desta corrida. Veja abaixo exatamente o que foi confirmado." %}
      {% endfor %}
    </section>

    <section aria-labelledby="details-recent-title">
      <div class="race-details-section-heading">
        <span>Recentes</span>
        <h2 id="details-recent-title">Período oficial encerrado</h2>
      </div>
      {% for event in public_calendar.recent %}
        {% include race-detail-card.html event=event status="past" status_label="Data encerrada" status_copy="O período desta corrida terminou segundo o calendário oficial. A página separa esse fato de resultados esportivos ainda não integrados." %}
      {% endfor %}
    </section>

    <section aria-labelledby="details-upcoming-title">
      <div class="race-details-section-heading">
        <span>Próximas</span>
        <h2 id="details-upcoming-title">Largadas confirmadas no calendário</h2>
      </div>
      {% for event in public_calendar.upcoming %}
        {% include race-detail-card.html event=event status="scheduled" status_label="Programada" status_copy="Esta corrida aparece como futura no calendário oficial. Datas, modalidade e classe são revalidadas diariamente antes de atualizar o blog." %}
      {% endfor %}
    </section>
  </div>
</div>

<script defer src="{{ site.baseurl }}/assets/js/race-details.js?v=1"></script>

---
layout: default
title: Corridas de bicicleta
description: "Cobertura técnica do ciclismo profissional e calendário de provas para participar no Brasil, com fontes oficiais verificadas."
permalink: /corridas/
audience_segment: "core_technical_cyclists"
audience_intent: "follow_market_competition"
experience_level_target: "intermediate_advanced"
brand: ""
model: ""
---

{% assign published_posts = site.posts | where_exp: "p", "p.status != 'draft'" %}
{% assign race_program = site.data["race-events"] %}
{% assign public_calendar = race_program.publicCalendar %}

<div class="race-hub" data-race-calendar data-today-count="{{ public_calendar.today | size }}" data-recent-count="{{ public_calendar.recent | size }}" data-upcoming-count="{{ public_calendar.upcoming | size }}" data-calendar-as-of="{{ public_calendar.asOfDate }}">
  <section class="race-hub-hero" aria-labelledby="race-hub-title">
    <div class="container race-hub-hero-inner">
      <span class="race-hub-kicker">TheBiker Blog · Competições</span>
      <h1 id="race-hub-title">O pelotão corre.<br>A agenda acompanha.</h1>
      <p>Corridas brasileiras em primeiro plano e grandes provas mundiais, explicadas em português e conferidas em fontes oficiais.</p>
      <div class="race-hub-status" aria-label="Resumo do calendário">
        <span><strong>{{ public_calendar.today | size }}</strong> em disputa hoje</span>
        <span><strong>{{ public_calendar.recent | size }}</strong> encerradas recentemente</span>
        <span><strong>{{ public_calendar.upcoming | size }}</strong> próximas provas</span>
        <span>Verificado em <strong>{{ public_calendar.generatedAt | date: "%d/%m/%Y" }}</strong></span>
      </div>
    </div>
  </section>

  <section class="container race-hub-tracks" aria-label="Áreas de corridas">
    <article class="race-track-card">
      <span>01</span>
      <h2>Acabaram de acontecer</h2>
      <p>Três provas importantes encerradas nos últimos dias, com data, categoria e ficha oficial verificadas.</p>
      <a href="#recentes">Ver provas recentes <span aria-hidden="true">↓</span></a>
    </article>
    <article class="race-track-card">
      <span>02</span>
      <h2>As próximas 10</h2>
      <p>Maioria brasileira, com provas participativas de MTB, sem perder WorldTour, Copa do Mundo e Campeonatos Mundiais.</p>
      <a href="#proximas">Abrir calendário <span aria-hidden="true">↓</span></a>
    </article>
  </section>

  <div class="container race-hub-content">
    <section id="hoje" class="race-today-section" aria-labelledby="today-races-title">
      <div class="race-today-card{% if public_calendar.today == empty %} race-today-card--empty{% endif %}">
        <div class="race-today-heading">
          <div>
            <span class="race-today-badge"><i aria-hidden="true"></i> Hoje</span>
            <h2 id="today-races-title">Em disputa hoje</h2>
          </div>
          <time datetime="{{ public_calendar.asOfDate }}">{{ public_calendar.asOfDateDisplay }}</time>
        </div>
        {% if public_calendar.today != empty %}
          <div class="race-today-events">
            {% for event in public_calendar.today %}
              {% assign country_pt = site.data["countries-pt"][event.countryCode] | default: event.country %}
              <article class="race-today-event">
                <div>
                  <span>{{ event.disciplineLabel }} · {{ country_pt }}</span>
                  <h3>{{ event.name }}</h3>
                  <p>{% include race-class-label.html value=event.competitionClass %}{% if event.venue != "" %} · {{ event.venue }}{% endif %}</p>
                  {% if event.deepProfile %}
                    <div class="race-card-insights" aria-label="Resumo do guia da corrida">
                      <span class="race-card-insight race-card-insight--verified">Guia completo</span>
                      {% if event.deepProfile.route.totalDistanceKm %}<span class="race-card-insight">{{ event.deepProfile.route.totalDistanceKm }} km</span>{% elsif event.deepProfile.route.courseOptions %}<span class="race-card-insight">{{ event.deepProfile.route.courseOptions.size }} percursos</span>{% endif %}
                      <span class="race-card-insight">{{ event.deepProfile.route.difficulty.label }}</span>
                    </div>
                  {% endif %}
                </div>
                <a href="{{ site.baseurl }}/corridas/detalhes/#{{ event.id }}" data-race-detail data-event-id="{{ event.id }}" data-race-section="today" aria-label="Ver detalhes em português de {{ event.name }}">Entender esta corrida <span aria-hidden="true">→</span></a>
              </article>
            {% endfor %}
          </div>
        {% else %}
          <p class="race-today-empty">Nenhuma prova do recorte profissional monitorado acontece hoje. O calendário abaixo mostra as próximas largadas confirmadas.</p>
        {% endif %}
      </div>
    </section>

    <section id="recentes" class="race-content-section" aria-labelledby="recent-races-title">
      <div class="race-section-heading">
        <div>
          <span>Calendário recente</span>
          <h2 id="recent-races-title">Encerradas recentemente</h2>
        </div>
        <p>Selecionamos as provas de maior nível encerradas mais recentemente. Cada card abre uma explicação em português dentro do blog.</p>
      </div>
      <div class="race-recent-grid">
        {% for event in public_calendar.recent %}
          {% assign country_pt = site.data["countries-pt"][event.countryCode] | default: event.country %}
          <article class="race-event-card race-event-card--completed">
            <div class="race-event-card-topline">
              <span class="race-event-status">Data encerrada</span>
              <span>{{ event.disciplineLabel }}</span>
            </div>
            <p class="race-event-date">
              <time datetime="{{ event.startsOn }}">{{ event.displayDate.startsOn }}</time>
              {% unless event.startsOn == event.endsOn %}<span aria-hidden="true">—</span> <time datetime="{{ event.endsOn }}">{{ event.displayDate.endsOnWithYear }}</time>{% endunless %}
            </p>
            <h3>{{ event.name }}</h3>
            <p class="race-event-location">{{ country_pt }}{% if event.venue != "" %} · {{ event.venue }}{% endif %}</p>
            <p class="race-event-class">{% include race-class-label.html value=event.competitionClass %}</p>
            <a href="{{ site.baseurl }}/corridas/detalhes/#{{ event.id }}" data-race-detail data-event-id="{{ event.id }}" data-race-section="recent">Ver informações validadas <span aria-hidden="true">→</span></a>
          </article>
        {% endfor %}
      </div>
    </section>

    <section id="proximas" class="race-content-section" aria-labelledby="upcoming-races-title">
      <div class="race-section-heading">
        <div>
          <span>Agenda de competições</span>
          <h2 id="upcoming-races-title">As próximas 10 corridas</h2>
        </div>
        <p>Confira as próximas provas do calendário brasileiro e internacional.</p>
      </div>
      <div class="race-calendar-tools" data-race-filters>
        <div>
          <strong>Encontre a prova certa</strong>
          <span><b data-race-filter-count>{{ public_calendar.upcoming | size }}</b> corridas exibidas</span>
        </div>
        <div class="race-filter-buttons" role="group" aria-label="Filtrar próximas corridas">
          <button type="button" class="is-active" data-race-filter="all" aria-pressed="true">Todas</button>
          <button type="button" data-race-filter="brazil" aria-pressed="false">Brasil</button>
          <button type="button" data-race-filter="guide" aria-pressed="false">Com guia completo</button>
        </div>
      </div>
      <ol class="race-upcoming-list" data-race-filter-list>
        {% for event in public_calendar.upcoming %}
          {% assign country_pt = site.data["countries-pt"][event.countryCode] | default: event.country %}
          <li class="race-upcoming-item" data-race-filter-item data-country-code="{{ event.countryCode }}" data-has-guide="{% if event.deepProfile %}true{% else %}false{% endif %}">
            <span class="race-upcoming-position" aria-hidden="true">{% if forloop.index < 10 %}0{% endif %}{{ forloop.index }}</span>
            <p class="race-upcoming-date">
              <time datetime="{{ event.startsOn }}">{{ event.displayDate.startsOn }}</time>
              {% unless event.startsOn == event.endsOn %}<span>até</span> <time datetime="{{ event.endsOn }}">{{ event.displayDate.endsOn }}</time>{% endunless %}
            </p>
            <div class="race-upcoming-main">
              <span>{{ event.disciplineLabel }} · {{ country_pt }}</span>
              <h3>{{ event.name }}</h3>
              <p>{% include race-class-label.html value=event.competitionClass %}{% if event.venue != "" %} · {{ event.venue }}{% endif %}</p>
              <div class="race-card-insights">
                {% if event.deepProfile %}
                  <span class="race-card-insight race-card-insight--verified">Guia completo</span>
                  <span class="race-card-insight">{{ event.deepProfile.participation.label }}</span>
                  {% if event.deepProfile.route.totalDistanceKm %}<span class="race-card-insight">{{ event.deepProfile.route.totalDistanceKm }} km</span>{% elsif event.deepProfile.route.courseOptions %}<span class="race-card-insight">{{ event.deepProfile.route.courseOptions.size }} percursos</span>{% endif %}
                  <span class="race-card-insight">Dificuldade: {{ event.deepProfile.route.difficulty.label }}</span>
                {% else %}
                  <span class="race-card-insight">Ficha essencial validada</span>
                {% endif %}
              </div>
            </div>
            <a href="{{ site.baseurl }}/corridas/detalhes/#{{ event.id }}" data-race-detail data-event-id="{{ event.id }}" data-race-section="upcoming" aria-label="Ver detalhes em português de {{ event.name }}">{% if event.deepProfile %}Abrir guia{% else %}Ver ficha{% endif %} <span aria-hidden="true">→</span></a>
          </li>
        {% endfor %}
      </ol>
      <p class="race-filter-empty" data-race-filter-empty hidden>Nenhuma corrida corresponde a este filtro.</p>
    </section>

    <section id="profissional" class="race-content-section" aria-labelledby="professional-title">
      <div class="race-section-heading">
        <div>
          <span>Conteúdo editorial</span>
          <h2 id="professional-title">Análises de corrida</h2>
        </div>
        <p>Prévias e leituras técnicas publicadas pelo blog, sempre separadas do calendário factual acima.</p>
      </div>
      <div class="brand-guide-grid race-article-grid">
        {% assign professional_found = false %}
        {% for post in published_posts %}
          {% if post.content_type == "previa-corrida" or post.content_type == "resumo-corrida" %}
            {% assign professional_found = true %}
            <article class="brand-guide-card">
              <a href="{{ site.baseurl }}{{ post.url }}">
                <img src="{{ site.baseurl }}{{ post.thumbnail | default: post.image | default: '/assets/img/system/covers/corrida-v2/card-640.webp' }}" alt="{{ post.image_alt | default: post.title | escape }}" width="900" height="600" loading="lazy">
              </a>
              <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%d.%m.%Y" }}</time>
              <h3><a href="{{ site.baseurl }}{{ post.url }}">{{ post.title }}</a></h3>
              {% if post.description %}<p>{{ post.description }}</p>{% endif %}
            </article>
          {% endif %}
        {% endfor %}
      </div>
      {% unless professional_found %}
        <div class="race-empty-state">
          <strong>Nenhuma análise publicada neste momento</strong>
          <p>O calendário oficial acima está ativo. As análises disponíveis aparecem nesta seção.</p>
        </div>
      {% endunless %}
    </section>

    <section id="participar" class="race-content-section" aria-labelledby="participant-title">
      <div class="race-section-heading">
        <div>
          <span>Calendário brasileiro</span>
          <h2 id="participant-title">Provas para participar</h2>
        </div>
        <p>Datas, categorias e inscrições só aparecem como confirmadas quando a organização ou a federação publica a informação.</p>
      </div>
      <div class="race-participant-grid">
        {% assign participant_found = false %}
        {% for event in public_calendar.upcoming %}
          {% if event.countryCode == "BRA" and event.deepProfile %}
            {% assign participant_found = true %}
            <article class="race-participant-card">
              <div class="race-participant-card-topline">
                <time datetime="{{ event.startsOn }}">{{ event.displayDate.startsOn }}{% unless event.startsOn == event.endsOn %}–{{ event.displayDate.endsOn }}{% endunless %}</time>
                <span>{{ event.deepProfile.participation.label }}</span>
              </div>
              <h3>{{ event.name }}</h3>
              <p>{{ event.venue }} · {{ event.deepProfile.route.format }}</p>
              <dl>
                <div><dt>Percurso</dt><dd>{% if event.deepProfile.route.totalDistanceKm %}{{ event.deepProfile.route.totalDistanceKm }} km{% else %}{{ event.deepProfile.route.courseOptions.size }} opções{% endif %}</dd></div>
                <div><dt>Dificuldade</dt><dd>{{ event.deepProfile.route.difficulty.label }}</dd></div>
              </dl>
              <a href="{{ site.baseurl }}/corridas/detalhes/#{{ event.id }}" data-race-detail data-event-id="{{ event.id }}" data-race-section="participant">Ver inscrição, percurso e logística <span aria-hidden="true">→</span></a>
            </article>
          {% endif %}
        {% endfor %}
      </div>
      {% unless participant_found %}
        <div class="race-empty-state">
          <strong>Nenhum guia de participação publicado</strong>
          <p>Não exibimos inscrição ou logística sem confirmação do organizador. As próximas corridas profissionais continuam disponíveis no calendário acima.</p>
        </div>
      {% endunless %}
    </section>
  </div>

  <section class="race-source-note">
    <div class="container">
      <strong>Compromisso de fonte</strong>
      <p>Dados sincronizados diariamente com a UCI e com o Calendário MTB, usado apenas para descoberta. Uma prova brasileira só entra após validação do local, das datas e da disponibilidade do site oficial da organização. “Em disputa hoje” indica que a data validada abrange o dia atual; não representa transmissão ao vivo nem confirma resultado. Duplicidades, fontes indisponíveis ou cobertura abaixo do mínimo bloqueiam a atualização.</p>
    </div>
  </section>
</div>

<script defer src="{{ site.baseurl }}/assets/js/race-calendar.js?v=1"></script>

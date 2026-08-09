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

<div class="race-hub">
  <section class="race-hub-hero" aria-labelledby="race-hub-title">
    <div class="container race-hub-hero-inner">
      <span class="race-hub-kicker">TheBiker Insights · Competições</span>
      <h1 id="race-hub-title">Corridas para acompanhar.<br>Provas para viver.</h1>
      <p>Cobertura técnica do cenário profissional e uma agenda criteriosa para quem quer alinhar em provas pelo Brasil.</p>
    </div>
  </section>

  <section class="container race-hub-tracks" aria-label="Áreas de corridas">
    <article class="race-track-card">
      <span>01</span>
      <h2>Cenário profissional</h2>
      <p>Prévias, resultados e análise das decisões técnicas e táticas que definem as principais competições.</p>
      <a href="#profissional">Ver cobertura <span aria-hidden="true">↓</span></a>
    </article>
    <article class="race-track-card">
      <span>02</span>
      <h2>Provas para participar</h2>
      <p>Calendário brasileiro, guias de evento e situação das inscrições, sempre separados do conteúdo profissional.</p>
      <a href="#participar">Ver calendário <span aria-hidden="true">↓</span></a>
    </article>
  </section>

  <div class="container race-hub-content">
    <section id="profissional" class="race-content-section" aria-labelledby="professional-title">
      <div class="race-section-heading">
        <div>
          <span>Cobertura</span>
          <h2 id="professional-title">Ciclismo profissional</h2>
        </div>
        <p>Fontes oficiais, resultado confirmado e leitura técnica sem transformar rumor em fato.</p>
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
          <strong>Cobertura em preparação</strong>
          <p>As primeiras análises aparecerão aqui depois da confirmação das fontes e da revisão editorial.</p>
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
      <div class="brand-guide-grid race-article-grid">
        {% assign participant_found = false %}
        {% for post in published_posts %}
          {% if post.content_type == "calendario-provas" or post.content_type == "guia-prova" %}
            {% assign participant_found = true %}
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
      {% unless participant_found %}
        <div class="race-empty-state">
          <strong>Calendário em preparação</strong>
          <p>Os eventos serão exibidos quando data, fonte oficial e situação da inscrição estiverem verificadas.</p>
        </div>
      {% endunless %}
    </section>
  </div>

  <section class="race-source-note">
    <div class="container">
      <strong>Compromisso de fonte</strong>
      <p>Uma prova pode mudar de data, regulamento ou inscrição. Por isso, cada publicação informa o que foi confirmado e o que ainda precisa ser consultado diretamente com a organização.</p>
    </div>
  </section>
</div>

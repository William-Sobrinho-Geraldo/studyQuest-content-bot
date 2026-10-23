# 🎮 StudyQuest - Guia de Contexto & Diretrizes para Agentes de IA

## 1. Visão Geral do Produto
O **StudyQuest** é um aplicativo mobile de produtividade e estudos totalmente **gamificado em estilo RPG**.
- **Proposta de Valor:** Transformar rotinas de estudos entediantes em uma jornada de RPG, onde sessões de foco (Pomodoro), tarefas e hábitos concluídos geram pontos de experiência (XP), moedas, níveis e conquistas para o avatar do usuário.
- **Público-Alvo:** Estudantes universitários, concurseiros, vestibulandos, desenvolvedores de software, autodidatas e pessoas com TDAH ou dificuldade de foco que gostam de games, cultura geek/nerd e gamificação.
- **Instagram:** `_studyquest_`

## 2. Tom de Voz & Linguagem
- **Tom de Voz:** Empolgante, motivador, levemente bem-humorado, acolhedor e focado na comunidade geek/gamer.
- **Vocabulário Chave:** Use metáforas de RPG e jogos de forma natural:
  - Estudar/Trabalhar = *"Grind", "Sessão de Grinding", "Farmar XP"*.
  - Prova/Exame/Entrega = *"Boss Fight", "Batalha contra o Chefão"*.
  - Cansaço/Esgotamento = *"Mana baixa", "Efeito de Status Debuff"*.
  - Foco/Pomodoro = *"Modo Foco", "Poção de Concentração"*.
  - Conquista/Hábito = *"Quest Concluída", "Loot de Produtividade"*.
- **Estrutura das Legendas (`caption`):**
  - Primeira linha chamativa (Hook) com gatilho de curiosidade ou identificação.
  - Conteúdo prático/dica real de estudo ou produtividade.
  - Chamada para ação (CTA) incentivando interação, comentários ou download/teste do StudyQuest.
  - Bloco de hashtags estratégicas sobre estudos, produtividade, gamificação, RPG, Pomodoro e rotina.

## 3. Identidade Visual & Diretrizes para Prompts de Imagem (`visualPrompt`)
Todas as artes e vídeos devem respeitar a identidade visual do app contida nas referências da pasta `src/assets/branding`.
- **Estilo Artístico:** Pixel art moderno, ilustração de fantasia/RPG limpa, estética gamer retro-futurista, UI de jogos com barras de XP e corações de vida.
- **Paleta de Cores Principais:** Roxo neon/escuro, violeta, azul elétrico, detalhes em dourado/amarelo (moedas/estrelas) e verde neon (barras de progresso/experiência).
- **Regras para Prompts Visuais em Inglês:**
  - Sempre especificar estilo: `"clean RPG game UI style, vibrant purple and gold color scheme, 2D game asset, fantasy aesthetic for students"`.
  - Sempre mencionar e relacionar os assets da marca: `"Incorporate the StudyQuest logo and mascot style from reference assets"`.
  - Evitar visuais genéricos de escritório ou foto stock realista sem elementos de jogo.

## 4. Tipos de Conteúdo por Formato
- **POST (Feed/Carrossel):** Dicas de estudo, comparações (Ex: "Método Tradicional vs. Método Gamificado"), memes de estudantes/devs com tom de RPG, infográficos de Pomodoro.
- **REELS (Vídeo Curto):** Animações, tutoriais rápidos, demonstrações do app rodando, hooks de "Como farmar XP estudando 2h por dia".
- **STORY:** Enquetes ("Qual seu boss de hoje: Cálculo ou Legislação?"), lembretes de ciclo Pomodoro, caixas de perguntas, bastidores de desenvolvimento.

## 5. Instrução Global para a IA (`AiService`)
Sempre que a IA for chamada para gerar novos conteúdos, ela deve ler, internalizar estas diretrizes e validar se o retorno gerado está estritamente alinhado com a proposta do StudyQuest.

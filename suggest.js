(function () {
  const { supabase, SUPABASE_URL } = window.supabaseApp;
  const suggestionsListElement = document.getElementById("suggestions-list");
  const suggestionsLoadingElement = document.getElementById("suggestions-loading");
  const publicMessageElement = document.getElementById("suggestion-public-message");
  const formMessageElement = document.getElementById("suggestion-form-message");
  const voteStatusBadgeElement = document.getElementById("suggestion-vote-status-badge");
  const cycleSummaryElement = document.getElementById("cycle-summary");
  const suggestionForm = document.getElementById("suggestion-form");
  const suggestionNameInput = document.getElementById("suggestion-name");
  const suggestionPhotoInput = document.getElementById("suggestion-photo");
  const submitSuggestionButton = document.getElementById("submit-suggestion-button");

  const STORAGE_BUCKET = "suggestion-images";
  let currentCycleStart = null;
  let hasVotedThisCycle = false;

  function getOrCreateVoterToken() {
    const storageKey = "voter_token";
    let voterToken = localStorage.getItem(storageKey);

    if (!voterToken) {
      voterToken =
        window.crypto?.randomUUID?.() ||
        `voter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(storageKey, voterToken);
    }

    return voterToken;
  }

  function getInitials(name) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  }

  function formatDate(dateString) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(`${dateString}T00:00:00`));
  }

  function showMessage(element, type, text) {
    element.textContent = text;
    element.className = `message ${type}`;
  }

  function hideMessage(element) {
    element.textContent = "";
    element.className = "message hidden";
  }

  function setVoteStatusBadge() {
    if (hasVotedThisCycle) {
      voteStatusBadgeElement.textContent = "Voto desta rodada ja usado";
      voteStatusBadgeElement.className = "status-badge success";
      return;
    }

    voteStatusBadgeElement.textContent = "Voto disponivel nesta rodada";
    voteStatusBadgeElement.className = "status-badge";
  }

  function createAvatar(person) {
    if (person.photo_url) {
      return `<img class="avatar" src="${person.photo_url}" alt="Foto de ${person.name}" loading="lazy" />`;
    }

    return `<div class="avatar-placeholder" aria-hidden="true">${getInitials(person.name)}</div>`;
  }

  function renderSuggestions(suggestions) {
    if (!suggestions.length) {
      suggestionsLoadingElement.textContent = "Nenhuma sugestao nesta rodada ainda.";
      suggestionsLoadingElement.classList.remove("hidden");
      suggestionsListElement.classList.add("hidden");
      return;
    }

    suggestionsLoadingElement.classList.add("hidden");
    suggestionsListElement.classList.remove("hidden");
    suggestionsListElement.innerHTML = suggestions
      .map(
        (suggestion) => `
          <article class="person-card">
            <div class="card-header">
              ${createAvatar(suggestion)}
              <div>
                <h3 class="person-name">${suggestion.name}</h3>
                <p class="votes-total">${suggestion.votes_count} voto(s) para entrar</p>
              </div>
            </div>
            <button
              class="primary-button suggestion-vote-button"
              data-suggestion-id="${suggestion.id}"
              ${hasVotedThisCycle ? "disabled" : ""}
            >
              Votar para adicionar
            </button>
          </article>
        `
      )
      .join("");
  }

  async function refreshCycleState() {
    const { data, error } = await supabase.rpc("refresh_suggestion_cycle");

    if (error) {
      cycleSummaryElement.textContent =
        "Nao foi possivel sincronizar a rodada atual. Atualize a pagina em instantes.";
      showMessage(
        publicMessageElement,
        "error",
        "Falha ao carregar a rodada de sugestoes."
      );
      return false;
    }

    const cycleData = Array.isArray(data) ? data[0] : data;

    if (!cycleData) {
      cycleSummaryElement.textContent =
        "Nenhuma informacao de rodada foi retornada pelo banco.";
      return false;
    }

    currentCycleStart = cycleData.cycle_start_date;
    cycleSummaryElement.textContent = `Rodada ativa de ${formatDate(
      cycleData.cycle_start_date
    )} ate ${formatDate(
      cycleData.cycle_end_date
    )}. Ao final, a pessoa com mais votos entra no ranking principal.`;

    if (cycleData.processed_winner_name) {
      showMessage(
        publicMessageElement,
        "success",
        `A rodada anterior foi fechada e ${cycleData.processed_winner_name} entrou no ranking principal.`
      );
    } else {
      hideMessage(publicMessageElement);
    }

    return true;
  }

  async function checkIfAlreadyVotedThisCycle() {
    if (!currentCycleStart) {
      return false;
    }

    const voterToken = getOrCreateVoterToken();

    const { data, error } = await supabase
      .from("suggestion_votes")
      .select("id")
      .eq("voter_token", voterToken)
      .eq("cycle_start_date", currentCycleStart)
      .limit(1);

    if (error) {
      hasVotedThisCycle =
        localStorage.getItem("last_suggestion_vote_cycle") === currentCycleStart;
      setVoteStatusBadge();
      return hasVotedThisCycle;
    }

    hasVotedThisCycle = Array.isArray(data) && data.length > 0;

    if (hasVotedThisCycle) {
      localStorage.setItem("last_suggestion_vote_cycle", currentCycleStart);
    } else {
      localStorage.removeItem("last_suggestion_vote_cycle");
    }

    setVoteStatusBadge();
    return hasVotedThisCycle;
  }

  async function loadSuggestions() {
    if (!currentCycleStart) {
      suggestionsLoadingElement.textContent = "Rodada atual indisponivel.";
      return;
    }

    const { data, error } = await supabase
      .from("suggested_people")
      .select("id, name, photo_url, votes_count")
      .eq("cycle_start_date", currentCycleStart)
      .eq("status", "active")
      .order("votes_count", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      suggestionsLoadingElement.textContent = "Erro ao carregar sugestoes.";
      showMessage(
        publicMessageElement,
        "error",
        "Nao foi possivel carregar a lista da rodada."
      );
      return;
    }

    renderSuggestions(data || []);
  }

  async function uploadSuggestionImage(file) {
    const fileExt = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const fileName = `${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.${fileExt}`;
    const filePath = `public/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filePath}`;
  }

  async function submitSuggestionVote(suggestionId, buttonElement) {
    hideMessage(publicMessageElement);

    if (hasVotedThisCycle) {
      showMessage(
        publicMessageElement,
        "warning",
        "Voce ja votou nesta rodada de 2 dias."
      );
      return;
    }

    buttonElement.disabled = true;
    buttonElement.textContent = "Enviando...";

    const voterToken = getOrCreateVoterToken();
    const { error } = await supabase.rpc("submit_suggestion_vote", {
      p_suggestion_id: suggestionId,
      p_voter_token: voterToken,
    });

    if (error) {
      const duplicateVote = error.message.toLowerCase().includes("already voted");

      if (duplicateVote || error.code === "23505") {
        hasVotedThisCycle = true;
        localStorage.setItem("last_suggestion_vote_cycle", currentCycleStart);
        setVoteStatusBadge();
        await loadSuggestions();
        showMessage(
          publicMessageElement,
          "warning",
          "Voce ja votou nesta rodada de 2 dias."
        );
        return;
      }

      buttonElement.disabled = false;
      buttonElement.textContent = "Votar para adicionar";
      showMessage(
        publicMessageElement,
        "error",
        "Nao foi possivel registrar o voto desta rodada."
      );
      return;
    }

    hasVotedThisCycle = true;
    localStorage.setItem("last_suggestion_vote_cycle", currentCycleStart);
    setVoteStatusBadge();
    await loadSuggestions();
    showMessage(
      publicMessageElement,
      "success",
      "Seu voto para adicionar foi registrado."
    );
  }

  suggestionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage(formMessageElement);

    const name = suggestionNameInput.value.trim();
    const photoFile = suggestionPhotoInput.files?.[0] || null;

    if (!name) {
      showMessage(formMessageElement, "error", "Informe um nome para a sugestao.");
      return;
    }

    submitSuggestionButton.disabled = true;
    submitSuggestionButton.textContent = photoFile
      ? "Enviando imagem..."
      : "Enviando sugestao...";

    try {
      let photoUrl = null;

      if (photoFile) {
        photoUrl = await uploadSuggestionImage(photoFile);
      }

      submitSuggestionButton.textContent = "Salvando sugestao...";

      const voterToken = getOrCreateVoterToken();
      const { error } = await supabase.rpc("submit_suggestion", {
        p_name: name,
        p_photo_url: photoUrl,
        p_voter_token: voterToken,
      });

      if (error) {
        showMessage(
          formMessageElement,
          "error",
          `Nao foi possivel enviar a sugestao. ${error.message}`
        );
        return;
      }

      suggestionForm.reset();
      await refreshCycleState();
      await loadSuggestions();
      showMessage(
        formMessageElement,
        "success",
        "Sugestao enviada para a rodada atual."
      );
    } catch (error) {
      showMessage(
        formMessageElement,
        "error",
        `Falha ao enviar a imagem ou salvar a sugestao. ${error.message}`
      );
    } finally {
      submitSuggestionButton.disabled = false;
      submitSuggestionButton.textContent = "Enviar sugestao";
    }
  });

  document.addEventListener("click", async (event) => {
    const voteButton = event.target.closest(".suggestion-vote-button");

    if (!voteButton) {
      return;
    }

    const suggestionId = voteButton.dataset.suggestionId;

    if (!suggestionId) {
      return;
    }

    await submitSuggestionVote(suggestionId, voteButton);
  });

  async function initSuggestionPage() {
    const cycleReady = await refreshCycleState();

    if (!cycleReady) {
      setVoteStatusBadge();
      return;
    }

    await checkIfAlreadyVotedThisCycle();
    await loadSuggestions();
  }

  initSuggestionPage();
})();

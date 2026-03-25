(function () {
  const { supabase } = window.supabaseApp;
  const top10ListElement = document.getElementById("top10-list");
  const top10LoadingElement = document.getElementById("top10-loading");
  const publicMessageElement = document.getElementById("public-message");

  let hasUsedDailyAction = false;

  function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getDevVoterTokenOverride() {
    const params = new URLSearchParams(window.location.search);
    const rawValue = params.get("dev_voter");
    const devToken = rawValue ? rawValue.trim() : "";
    return devToken || null;
  }

  function getOrCreateVoterToken() {
    const devTokenOverride = getDevVoterTokenOverride();

    if (devTokenOverride) {
      return `dev-voter:${devTokenOverride}`;
    }

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

  function showMessage(type, text) {
    publicMessageElement.textContent = text;
    publicMessageElement.className = `message ${type}`;
  }

  function hideMessage() {
    publicMessageElement.textContent = "";
    publicMessageElement.className = "message hidden";
  }

  function createAvatar(person) {
    if (person.photo_url) {
      return `<img class="avatar" src="${person.photo_url}" alt="Foto de ${person.name}" loading="lazy" />`;
    }

    return `<div class="avatar-placeholder" aria-hidden="true">${getInitials(person.name)}</div>`;
  }

  function createVoteActions(personId) {
    const disabledAttribute = hasUsedDailyAction ? "disabled" : "";

    return `
      <div class="vote-actions">
        <button
          class="vote-button arrow-vote-button arrow-vote-button-up"
          data-person-id="${personId}"
          data-vote-type="upvote"
          aria-label="Upvote"
          title="Upvote"
          ${disabledAttribute}
        >
          <span class="arrow-icon" aria-hidden="true">▲</span>
        </button>
        <button
          class="vote-button arrow-vote-button arrow-vote-button-down"
          data-person-id="${personId}"
          data-vote-type="downvote"
          aria-label="Downvote"
          title="Downvote"
          ${disabledAttribute}
        >
          <span class="arrow-icon" aria-hidden="true">▼</span>
        </button>
      </div>
    `;
  }

  function renderTop10(people) {
    if (!people.length) {
      top10LoadingElement.textContent = "Nenhuma pessoa ativa encontrada.";
      top10LoadingElement.classList.remove("hidden");
      top10ListElement.classList.add("hidden");
      return;
    }

    top10LoadingElement.classList.add("hidden");
    top10ListElement.classList.remove("hidden");

    top10ListElement.innerHTML = people
      .map(
        (person, index) => `
          <article class="top-card ${index === 0 ? "top-card-first" : ""}">
            <div class="top-card-rank">
              <span class="rank-pill">#${index + 1}</span>
            </div>
            <div class="card-header">
              ${createAvatar(person)}
              <div class="top-card-content">
                <h3 class="person-name">${person.name}</h3>
                <p class="votes-total">${person.votes_count} voto(s)</p>
              </div>
            </div>
            <div class="top-card-action">
              ${createVoteActions(person.id)}
            </div>
          </article>
        `
      )
      .join("");
  }

  async function loadTop10() {
    const { data, error } = await supabase
      .from("people")
      .select("id, name, photo_url, votes_count")
      .eq("active", true)
      .order("votes_count", { ascending: false })
      .order("name", { ascending: true })
      .limit(10);

    if (error) {
      top10LoadingElement.textContent = "Erro ao carregar o Top 10.";
      showMessage("error", "Nao foi possivel carregar o ranking agora.");
      return;
    }

    renderTop10(data || []);
  }

  async function checkIfAlreadyVotedToday() {
    const voterToken = getOrCreateVoterToken();
    const today = getTodayDateString();

    const { data, error } = await supabase
      .from("votes")
      .select("id, vote_type", { head: false })
      .eq("voter_token", voterToken)
      .eq("vote_date", today)
      .limit(1);

    if (error) {
      hasUsedDailyAction = localStorage.getItem("last_vote_date") === today;
      return hasUsedDailyAction;
    }

    hasUsedDailyAction = Array.isArray(data) && data.length > 0;

    if (hasUsedDailyAction) {
      localStorage.setItem("last_vote_date", today);
    } else {
      localStorage.removeItem("last_vote_date");
    }

    return hasUsedDailyAction;
  }

  async function submitVote(personId, voteType, buttonElement) {
    hideMessage();

    if (hasUsedDailyAction) {
      showMessage("warning", "Voce ja usou sua acao de hoje.");
      return;
    }

    const cardElement = buttonElement.closest(".top-card, .person-card");
    const cardButtons = cardElement
      ? Array.from(cardElement.querySelectorAll(".vote-button"))
      : [buttonElement];

    cardButtons.forEach((button) => {
      button.disabled = true;
    });

    const today = getTodayDateString();
    const voterToken = getOrCreateVoterToken();
    const voteValue = voteType === "downvote" ? -1 : 1;

    const { error } = await supabase.rpc("submit_vote", {
      p_person_id: personId,
      p_voter_token: voterToken,
      p_vote_date: today,
      p_vote_value: voteValue,
      p_vote_type: voteType,
    });

    if (error) {
      const duplicateVote = error.message.toLowerCase().includes("already voted");
      hasUsedDailyAction = duplicateVote || error.code === "23505";

      if (hasUsedDailyAction) {
        localStorage.setItem("last_vote_date", today);
        await loadTop10();
        showMessage("warning", "Voce ja usou sua acao de hoje.");
        return;
      }

      cardButtons.forEach((button) => {
        button.disabled = false;
      });
      showMessage("error", "Nao foi possivel registrar seu voto. Tente novamente.");
      return;
    }

    hasUsedDailyAction = true;
    localStorage.setItem("last_vote_date", today);
    showMessage("success", "Voto registrado com sucesso.");

    await loadTop10();
  }

  document.addEventListener("click", async (event) => {
    const voteButton = event.target.closest(".vote-button");

    if (!voteButton) {
      return;
    }

    const personId = voteButton.dataset.personId;
    const voteType = voteButton.dataset.voteType || "upvote";

    if (!personId) {
      return;
    }

    await submitVote(personId, voteType, voteButton);
  });

  async function initPage() {
    await checkIfAlreadyVotedToday();
    await loadTop10();
  }

  initPage();
})();

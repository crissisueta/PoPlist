(function () {
  const { supabase } = window.supabaseApp;
  const top10ListElement = document.getElementById("top10-list");
  const allPeopleListElement = document.getElementById("all-people-list");
  const top10LoadingElement = document.getElementById("top10-loading");
  const allPeopleLoadingElement = document.getElementById("all-people-loading");
  const publicMessageElement = document.getElementById("public-message");
  const voteStatusBadgeElement = document.getElementById("vote-status-badge");

  let hasVotedToday = false;

  function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getTomorrowDateString() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const day = String(tomorrow.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

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

  function showMessage(type, text) {
    publicMessageElement.textContent = text;
    publicMessageElement.className = `message ${type}`;
  }

  function hideMessage() {
    publicMessageElement.textContent = "";
    publicMessageElement.className = "message hidden";
  }

  function setVoteStatusBadge() {
    if (hasVotedToday) {
      voteStatusBadgeElement.textContent = `Voto usado hoje. Libera em ${getTomorrowDateString()}`;
      voteStatusBadgeElement.className = "status-badge success";
      return;
    }

    voteStatusBadgeElement.textContent = "Disponível para votar";
    voteStatusBadgeElement.className = "status-badge";
  }

  function createAvatar(person) {
    if (person.photo_url) {
      return `<img class="avatar" src="${person.photo_url}" alt="Foto de ${person.name}" loading="lazy" />`;
    }

    return `<div class="avatar-placeholder" aria-hidden="true">${getInitials(person.name)}</div>`;
  }

  function createVoteButton(personId) {
    const disabledAttribute = hasVotedToday ? "disabled" : "";
    const buttonText = hasVotedToday ? "Voto indisponível hoje" : "Votar";

    return `
      <button
        class="primary-button vote-button"
        data-person-id="${personId}"
        ${disabledAttribute}
      >
        ${buttonText}
      </button>
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
          </article>
        `
      )
      .join("");
  }

  function renderAllPeople(people) {
    if (!people.length) {
      allPeopleLoadingElement.textContent = "Nenhuma pessoa ativa cadastrada.";
      allPeopleLoadingElement.classList.remove("hidden");
      allPeopleListElement.classList.add("hidden");
      return;
    }

    allPeopleLoadingElement.classList.add("hidden");
    allPeopleListElement.classList.remove("hidden");

    allPeopleListElement.innerHTML = people
      .map(
        (person) => `
          <article class="person-card">
            <div class="card-header">
              ${createAvatar(person)}
              <div>
                <h3 class="person-name">${person.name}</h3>
                <p class="votes-total">${person.votes_count} voto(s)</p>
              </div>
            </div>
            ${createVoteButton(person.id)}
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

  async function loadAllPeople() {
    const { data, error } = await supabase
      .from("people")
      .select("id, name, photo_url, votes_count")
      .eq("active", true)
      .order("votes_count", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      allPeopleLoadingElement.textContent = "Erro ao carregar a lista completa.";
      showMessage("error", "Nao foi possivel carregar a lista de pessoas.");
      return;
    }

    renderAllPeople(data || []);
  }

  async function checkIfAlreadyVotedToday() {
    const voterToken = getOrCreateVoterToken();
    const today = getTodayDateString();

    const { data, error } = await supabase
      .from("votes")
      .select("id", { head: false })
      .eq("voter_token", voterToken)
      .eq("vote_date", today)
      .limit(1);

    if (error) {
      hasVotedToday = localStorage.getItem("last_vote_date") === today;
      setVoteStatusBadge();
      return hasVotedToday;
    }

    hasVotedToday = Array.isArray(data) && data.length > 0;

    if (hasVotedToday) {
      localStorage.setItem("last_vote_date", today);
    } else {
      localStorage.removeItem("last_vote_date");
    }

    setVoteStatusBadge();
    return hasVotedToday;
  }

  async function submitVote(personId, buttonElement) {
    hideMessage();

    if (hasVotedToday) {
      showMessage(
        "warning",
        `Voce ja votou hoje. Tente novamente em ${getTomorrowDateString()}.`
      );
      return;
    }

    buttonElement.disabled = true;
    buttonElement.textContent = "Enviando...";

    const today = getTodayDateString();
    const voterToken = getOrCreateVoterToken();

    const { error } = await supabase.rpc("submit_vote", {
      p_person_id: personId,
      p_voter_token: voterToken,
      p_vote_date: today,
    });

    if (error) {
      const duplicateVote = error.message.toLowerCase().includes("already voted");
      hasVotedToday = duplicateVote || error.code === "23505";

      if (hasVotedToday) {
        localStorage.setItem("last_vote_date", today);
        setVoteStatusBadge();
        await Promise.all([loadTop10(), loadAllPeople()]);
        showMessage(
          "warning",
          `Voce ja votou hoje. Tente novamente em ${getTomorrowDateString()}.`
        );
        return;
      }

      buttonElement.disabled = false;
      buttonElement.textContent = "Votar";
      showMessage("error", "Nao foi possivel registrar seu voto. Tente novamente.");
      return;
    }

    hasVotedToday = true;
    localStorage.setItem("last_vote_date", today);
    setVoteStatusBadge();

    await Promise.all([loadTop10(), loadAllPeople()]);
    showMessage("success", "Voto registrado com sucesso.");
  }

  document.addEventListener("click", async (event) => {
    const voteButton = event.target.closest(".vote-button");

    if (!voteButton) {
      return;
    }

    const personId = voteButton.dataset.personId;

    if (!personId) {
      return;
    }

    await submitVote(personId, voteButton);
  });

  async function init() {
    hideMessage();
    setVoteStatusBadge();

    await checkIfAlreadyVotedToday();
    await Promise.all([loadTop10(), loadAllPeople()]);
  }

  window.loadTop10 = loadTop10;
  window.loadAllPeople = loadAllPeople;
  window.submitVote = submitVote;
  window.checkIfAlreadyVotedToday = checkIfAlreadyVotedToday;

  init();
})();

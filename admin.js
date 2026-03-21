(function () {
  const { supabase, ADMIN_EMAIL } = window.supabaseApp;

  const loginSection = document.getElementById("login-section");
  const dashboardSection = document.getElementById("dashboard-section");
  const loginForm = document.getElementById("login-form");
  const loginMessageElement = document.getElementById("login-message");
  const dashboardMessageElement = document.getElementById("dashboard-message");
  const loggedUserElement = document.getElementById("logged-user");
  const logoutButton = document.getElementById("logout-button");
  const personForm = document.getElementById("person-form");
  const personIdInput = document.getElementById("person-id");
  const personNameInput = document.getElementById("person-name");
  const personPhotoUrlInput = document.getElementById("person-photo-url");
  const personActiveInput = document.getElementById("person-active");
  const adminPeopleListElement = document.getElementById("admin-people-list");
  const adminLoadingElement = document.getElementById("admin-loading");
  const formTitleElement = document.getElementById("form-title");
  const cancelEditButton = document.getElementById("cancel-edit-button");
  const savePersonButton = document.getElementById("save-person-button");

  function getCurrentMessageElement() {
    return dashboardSection.classList.contains("hidden")
      ? loginMessageElement
      : dashboardMessageElement;
  }

  function showAdminMessage(type, text) {
    const messageElement = getCurrentMessageElement();
    loginMessageElement.textContent = "";
    dashboardMessageElement.textContent = "";
    loginMessageElement.className = "message hidden";
    dashboardMessageElement.className = "message hidden";
    messageElement.textContent = text;
    messageElement.className = `message ${type}`;
  }

  function hideAdminMessage() {
    loginMessageElement.textContent = "";
    dashboardMessageElement.textContent = "";
    loginMessageElement.className = "message hidden";
    dashboardMessageElement.className = "message hidden";
  }

  function resetPersonForm() {
    personIdInput.value = "";
    personForm.reset();
    personActiveInput.checked = true;
    formTitleElement.textContent = "Nova pessoa";
    cancelEditButton.classList.add("hidden");
  }

  function isAdminUser(session) {
    const userEmail = session?.user?.email?.toLowerCase();
    return Boolean(userEmail && userEmail === ADMIN_EMAIL.toLowerCase());
  }

  function formatSupabaseError(error, fallbackMessage) {
    if (!error) {
      return fallbackMessage;
    }

    const details = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" | ");

    return details ? `${fallbackMessage} Detalhes: ${details}` : fallbackMessage;
  }

  async function getValidatedAdminSession() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.error("Erro ao recuperar a sessao do admin:", error);
      showAdminMessage(
        "error",
        formatSupabaseError(error, "Nao foi possivel validar sua sessao atual.")
      );
      return null;
    }

    if (!session) {
      console.error("Tentativa de acao admin sem sessao autenticada.");
      showAdminMessage("error", "Sua sessao expirou. Faca login novamente.");
      showLoginOnly();
      return null;
    }

    if (!isAdminUser(session)) {
      console.error("Sessao autenticada sem permissao de admin:", session.user);
      showAdminMessage("error", "Este usuario nao tem permissao de administrador.");
      return null;
    }

    return session;
  }

  function buildPersonPayload() {
    return {
      name: personNameInput.value.trim(),
      photo_url: personPhotoUrlInput.value.trim() || null,
      active: personActiveInput.checked,
    };
  }

  function setPersonFormBusy(isBusy, editingPersonId) {
    savePersonButton.disabled = isBusy;
    savePersonButton.textContent = isBusy
      ? editingPersonId
        ? "Salvando alteracoes..."
        : "Criando pessoa..."
      : "Salvar pessoa";
  }

  function showLoginOnly() {
    loginSection.classList.remove("hidden");
    dashboardSection.classList.add("hidden");
  }

  function showDashboard(session) {
    loginSection.classList.add("hidden");
    dashboardSection.classList.remove("hidden");
    loggedUserElement.textContent = `Logado como: ${session.user.email}`;
  }

  function renderAdminPeople(people) {
    if (!people.length) {
      adminLoadingElement.textContent = "Nenhuma pessoa cadastrada ainda.";
      adminLoadingElement.classList.remove("hidden");
      adminPeopleListElement.classList.add("hidden");
      return;
    }

    adminLoadingElement.classList.add("hidden");
    adminPeopleListElement.classList.remove("hidden");

    adminPeopleListElement.innerHTML = people
      .map(
        (person) => `
          <article class="admin-card">
            <h3 class="person-name">${person.name}</h3>
            <p class="admin-meta">
              Votos: ${person.votes_count}<br />
              Ativo: ${person.active ? "Sim" : "Nao"}<br />
              Foto: ${person.photo_url || "Sem foto"}
            </p>
            <div class="admin-actions">
              <button
                type="button"
                class="ghost-button edit-person-button"
                data-person-id="${person.id}"
              >
                Editar
              </button>
              <button
                type="button"
                class="secondary-button delete-person-button"
                data-person-id="${person.id}"
              >
                Excluir
              </button>
            </div>
          </article>
        `
      )
      .join("");
  }

  async function ensureAdminSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      showLoginOnly();
      return null;
    }

    if (!isAdminUser(session)) {
      await supabase.auth.signOut();
      showLoginOnly();
      showAdminMessage(
        "error",
        "Este usuario nao tem permissao para acessar o painel."
      );
      return null;
    }

    hideAdminMessage();
    showDashboard(session);
    return session;
  }

  async function loadAdminPeople() {
    adminLoadingElement.textContent = "Carregando pessoas...";
    adminLoadingElement.classList.remove("hidden");
    adminPeopleListElement.classList.add("hidden");

    const session = await getValidatedAdminSession();

    if (!session) {
      adminLoadingElement.textContent = "Sessao admin indisponivel.";
      return;
    }

    const { data, error } = await supabase
      .from("people")
      .select("id, name, photo_url, active, votes_count")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar pessoas no painel:", error);
      adminLoadingElement.textContent = "Erro ao carregar pessoas.";
      showAdminMessage(
        "error",
        formatSupabaseError(error, "Nao foi possivel carregar o cadastro.")
      );
      return;
    }

    renderAdminPeople(data || []);
  }

  async function adminLogin(email, password) {
    hideAdminMessage();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Erro no login admin:", error);
      showAdminMessage(
        "error",
        formatSupabaseError(error, "E-mail ou senha invalidos.")
      );
      return null;
    }

    if (!isAdminUser(data.session)) {
      console.error("Usuario autenticado sem permissao admin:", data.session?.user);
      await supabase.auth.signOut();
      showAdminMessage(
        "error",
        "Este usuario autenticou, mas nao esta autorizado como admin."
      );
      return null;
    }

    showDashboard(data.session);
    await loadAdminPeople();
    showAdminMessage("success", "Login realizado com sucesso.");
    return data.session;
  }

  async function createPerson(payload) {
    try {
      console.log("createPerson > antes do insert", payload);

      const { error } = await supabase.from("people").insert([payload]);

      if (error) {
        console.error("createPerson > erro no insert", error);
        showAdminMessage(
          "error",
          formatSupabaseError(error, "Nao foi possivel criar a pessoa.")
        );
        return false;
      }

      console.log("createPerson > insert concluido com sucesso");
      showAdminMessage("success", `Pessoa "${payload.name}" criada com sucesso.`);
      return true;
    } catch (error) {
      console.error("createPerson > excecao inesperada", error);
      showAdminMessage(
        "error",
        formatSupabaseError(error, "Erro inesperado ao criar a pessoa.")
      );
      return false;
    }
  }

  async function updatePerson(personId, payload) {
    const session = await getValidatedAdminSession();

    if (!session) {
      return false;
    }

    console.log("Atualizando pessoa:", { personId, payload });

    const { error } = await supabase.from("people").update(payload).eq("id", personId);

    if (error) {
      console.error("Erro ao atualizar pessoa:", error, { personId, payload });
      showAdminMessage(
        "error",
        formatSupabaseError(error, "Nao foi possivel atualizar a pessoa.")
      );
      return false;
    }

    showAdminMessage("success", "Pessoa atualizada com sucesso.");
    return true;
  }

  async function deletePerson(personId) {
    const session = await getValidatedAdminSession();

    if (!session) {
      return false;
    }

    console.log("Excluindo pessoa:", personId);
    const { error } = await supabase.from("people").delete().eq("id", personId);

    if (error) {
      console.error("Erro ao excluir pessoa:", error, { personId });
      showAdminMessage(
        "error",
        formatSupabaseError(error, "Nao foi possivel excluir a pessoa.")
      );
      return false;
    }

    showAdminMessage("success", "Pessoa excluida com sucesso.");
    return true;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    const session = await adminLogin(email, password);

    if (session) {
      loginForm.reset();
    }
  });

  logoutButton.addEventListener("click", async () => {
    await supabase.auth.signOut();
    resetPersonForm();
    showLoginOnly();
    showAdminMessage("success", "Voce saiu do painel.");
  });

  personForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAdminMessage();

    const payload = buildPersonPayload();
    const editingPersonId = personIdInput.value;

    console.log("personForm submit > inicio", {
      editingPersonId: editingPersonId || null,
      payload,
    });

    if (!payload.name) {
      showAdminMessage("error", "O nome e obrigatorio.");
      return;
    }

    savePersonButton.disabled = true;
    savePersonButton.textContent = editingPersonId
      ? "Salvando alteracoes..."
      : "Criando pessoa...";

    try {
      const saved = editingPersonId
        ? await updatePerson(editingPersonId, payload)
        : await createPerson(payload);

      if (!saved) {
        console.log("personForm submit > operacao retornou false");
        return;
      }

      console.log("personForm submit > recarregando lista");
      await loadAdminPeople();

      console.log("personForm submit > resetando formulario");
      resetPersonForm();
    } catch (error) {
      console.error("personForm submit > excecao inesperada", error);
      showAdminMessage(
        "error",
        formatSupabaseError(error, "Erro inesperado ao salvar a pessoa.")
      );
    } finally {
      savePersonButton.disabled = false;
      savePersonButton.textContent = "Salvar pessoa";
      console.log("personForm submit > finalizado");
    }
  });

  cancelEditButton.addEventListener("click", () => {
    hideAdminMessage();
    resetPersonForm();
  });

  document.addEventListener("click", async (event) => {
    const editButton = event.target.closest(".edit-person-button");
    const deleteButton = event.target.closest(".delete-person-button");

    if (editButton) {
      const personId = editButton.dataset.personId;
      const { data, error } = await supabase
        .from("people")
        .select("id, name, photo_url, active")
        .eq("id", personId)
        .single();

      if (error) {
        console.error("Erro ao carregar pessoa para edicao:", error, { personId });
        showAdminMessage(
          "error",
          formatSupabaseError(
            error,
            "Nao foi possivel carregar a pessoa para edicao."
          )
        );
        return;
      }

      personIdInput.value = data.id;
      personNameInput.value = data.name;
      personPhotoUrlInput.value = data.photo_url || "";
      personActiveInput.checked = data.active;
      formTitleElement.textContent = "Editar pessoa";
      cancelEditButton.classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (deleteButton) {
      const personId = deleteButton.dataset.personId;
      const confirmed = window.confirm(
        "Tem certeza que deseja excluir esta pessoa? Todos os votos dela tambem serao removidos."
      );

      if (!confirmed) {
        return;
      }

      const deleted = await deletePerson(personId);

      if (deleted) {
        await loadAdminPeople();
      }
    }
  });

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session) {
      showLoginOnly();
      return;
    }

    if (!isAdminUser(session)) {
      await supabase.auth.signOut();
      showLoginOnly();
      showAdminMessage("error", "Somente o e-mail admin pode acessar o painel.");
      return;
    }

    showDashboard(session);
    await loadAdminPeople();
  });

  async function initAdmin() {
    resetPersonForm();
    const session = await ensureAdminSession();

    if (session) {
      await loadAdminPeople();
    }
  }

  window.adminLogin = adminLogin;
  window.createPerson = createPerson;
  window.updatePerson = updatePerson;
  window.deletePerson = deletePerson;

  initAdmin();
})();

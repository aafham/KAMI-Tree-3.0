const state = {
  view: "focus",
  selectedId: null,
  rootId: null,
  focusExpand: { ancestors: 1, children: {} },
  fullTree: { gen: 2, expanded: new Set(), branchOnly: false },
  searchIndex: [],
  pan: { x: 0, y: 0, zoom: 1 },
  drawerOpen: false,
};

const el = (id) => document.getElementById(id);
const focusView = el("focusView");
const fullTreeView = el("fullTreeView");
const searchInput = el("searchInput");
const searchResults = el("searchResults");
const treeStage = el("treeStage");
const fullTreeCanvas = el("fullTreeCanvas");
const drawer = el("detailDrawer");
const drawerContent = el("drawerContent");
const drawerTitle = el("drawerTitle");

let people = [];
let peopleById = new Map();

function initData(data) {
  people = data.people || [];
  peopleById = new Map(people.map(p => [p.id, p]));
  state.searchIndex = people.map(p => ({ id: p.id, name: p.name.toLowerCase() }));
  state.rootId = data.rootId || (people[0] ? people[0].id : null);
  state.selectedId = state.rootId;
  updateStats();
  render();
}

function updateStats() {
  el("statPeople").textContent = people.length;
  const families = people.filter(p => (p.spouses || []).length > 0).length;
  el("statFamilies").textContent = families;
  const generations = estimateGenerations();
  el("statGenerations").textContent = generations;
}

function estimateGenerations() {
  if (!state.rootId) return 0;
  const visited = new Set();
  let maxDepth = 1;
  const stack = [{ id: state.rootId, depth: 1 }];
  while (stack.length) {
    const { id, depth } = stack.pop();
    if (visited.has(id)) continue;
    visited.add(id);
    maxDepth = Math.max(maxDepth, depth);
    const p = peopleById.get(id);
    if (!p) continue;
    (p.children || []).forEach(childId => stack.push({ id: childId, depth: depth + 1 }));
  }
  return maxDepth;
}

function render() {
  if (!state.selectedId && state.view === "focus") {
    renderEmptyState();
    return;
  }
  if (state.view === "focus") {
    focusView.hidden = false;
    fullTreeView.hidden = true;
    renderFocus();
  } else {
    focusView.hidden = true;
    fullTreeView.hidden = false;
    renderFullTree();
  }
}

function renderEmptyState() {
  focusView.innerHTML = `
    <div class="empty-state">
      <h2>Search for a person to begin</h2>
      <p>Use the search bar or select a root person.</p>
    </div>
  `;
}

function renderFocus() {
  const person = peopleById.get(state.selectedId);
  if (!person) {
    renderEmptyState();
    return;
  }

  const parents = (person.parents || []).map(id => peopleById.get(id)).filter(Boolean);
  const spouses = (person.spouses || []).map(id => peopleById.get(id)).filter(Boolean);
  const children = (person.children || []).map(id => peopleById.get(id)).filter(Boolean);

  const childLimit = 4;
  const visibleChildren = children.slice(0, childLimit);
  const remaining = children.length - visibleChildren.length;

  focusView.innerHTML = `
    <div class="focus-section" style="grid-column: 2; grid-row: 1;">
      <h3>Parents</h3>
      <div class="focus-grid" id="parentsGrid"></div>
      <button class="btn" id="expandAncestors">Expand ancestors</button>
    </div>
    <div class="focus-section" style="grid-column: 1; grid-row: 2;">
      <h3>Spouses</h3>
      <div class="focus-grid" id="spousesGrid"></div>
    </div>
    <div class="focus-center">
      <div id="centerCard"></div>
    </div>
    <div class="focus-section" style="grid-column: 3; grid-row: 2;">
      <h3>Actions</h3>
      <div class="focus-grid">
        <button class="btn" id="centerHere">Center here</button>
      </div>
    </div>
    <div class="focus-section" style="grid-column: 2; grid-row: 3;">
      <h3>Children</h3>
      <div class="focus-grid" id="childrenGrid"></div>
      ${remaining > 0 ? `<button class="btn" id="moreChildren">+${remaining} more</button>` : ""}
    </div>
  `;

  el("centerCard").innerHTML = cardTemplate(person);
  el("parentsGrid").innerHTML = parents.length ? parents.map(cardTemplate).join("") : `<div class="muted">No parents listed</div>`;
  el("spousesGrid").innerHTML = spouses.length ? spouses.map(cardTemplate).join("") : `<div class="muted">No spouses listed</div>`;
  el("childrenGrid").innerHTML = visibleChildren.length ? visibleChildren.map(cardTemplate).join("") : `<div class="muted">No children listed</div>`;

  el("expandAncestors").onclick = () => expandAncestors(person.id);
  const moreBtn = el("moreChildren");
  if (moreBtn) moreBtn.onclick = () => expandChildrenList(person.id);
  el("centerHere").onclick = () => centerOn(person.id);
  attachCardHandlers();
}

function renderFullTree() {
  const root = peopleById.get(state.rootId);
  if (!root) return;
  treeStage.innerHTML = "";
  const tree = buildTreeNode(root.id, 1);
  treeStage.appendChild(tree);
  applyPanZoom();
  updateBreadcrumbs();
  attachCardHandlers();
}

function buildTreeNode(personId, depth) {
  const person = peopleById.get(personId);
  const node = document.createElement("div");
  node.className = "tree-level";
  node.dataset.personId = personId;
  node.innerHTML = cardTemplate(person, true);

  if (!person || depth > state.fullTree.gen) return node;

  const children = (person.children || []).map(id => peopleById.get(id)).filter(Boolean);
  if (!children.length) return node;

  const branchOnly = state.fullTree.branchOnly && personId !== state.selectedId;
  const isExpanded = state.fullTree.expanded.has(personId) || depth < state.fullTree.gen;
  if (!isExpanded || branchOnly) return node;

  const childWrap = document.createElement("div");
  childWrap.className = "tree-children";
  children.forEach(child => {
    childWrap.appendChild(buildTreeNode(child.id, depth + 1));
  });
  node.appendChild(childWrap);
  return node;
}

function cardTemplate(person, compact = false) {
  if (!person) return "";
  const genderClass = person.gender === "male" ? "gender-male" : person.gender === "female" ? "gender-female" : "gender-unknown";
  const years = person.birthYear || person.deathYear ? `${person.birthYear || "?"}–${person.deathYear || "?"}` : "";
  return `
    <div class="node-card" data-person-id="${person.id}">
      <div class="meta">
        <div class="name">${person.name}</div>
        ${years ? `<div class="years">${years}</div>` : ""}
      </div>
      <div class="gender ${genderClass}">${person.gender || "?"}</div>
    </div>
  `;
}

function attachCardHandlers() {
  document.querySelectorAll(".node-card").forEach(card => {
    card.onclick = () => {
      const id = card.dataset.personId;
      openDrawer(id);
    };
  });
}

function openDrawer(id) {
  const person = peopleById.get(id);
  if (!person) return;
  state.drawerOpen = true;
  drawer.classList.add("active");
  drawer.setAttribute("aria-hidden", "false");
  drawerTitle.textContent = person.name;
  drawerContent.innerHTML = `
    <div><strong>Gender:</strong> ${person.gender || "Unknown"}</div>
    <div><strong>Birth:</strong> ${person.birthYear || "?"}</div>
    <div><strong>Death:</strong> ${person.deathYear || "?"}</div>
    <div><strong>Parents:</strong> ${(person.parents || []).map(pid => peopleById.get(pid)?.name).filter(Boolean).join(", ") || "-"}</div>
    <div><strong>Spouses:</strong> ${(person.spouses || []).map(pid => peopleById.get(pid)?.name).filter(Boolean).join(", ") || "-"}</div>
    <div><strong>Children:</strong> ${(person.children || []).map(pid => peopleById.get(pid)?.name).filter(Boolean).join(", ") || "-"}</div>
  `;
  el("drawerGoTo").onclick = () => {
    centerOn(id);
    closeDrawer();
  };
}

function closeDrawer() {
  state.drawerOpen = false;
  drawer.classList.remove("active");
  drawer.setAttribute("aria-hidden", "true");
}

function centerOn(id) {
  state.selectedId = id;
  state.rootId = id;
  render();
}

function expandAncestors(id) {
  const person = peopleById.get(id);
  if (!person) return;
  person.parents?.forEach(pid => {
    state.fullTree.expanded.add(pid);
  });
  render();
}

function expandChildrenList(id) {
  state.selectedId = id;
  render();
}

function updateBreadcrumbs() {
  const crumbs = getPathToRoot(state.selectedId || state.rootId).reverse();
  el("breadcrumbs").textContent = crumbs.map(p => p.name).join(" > ") || "";
}

function getPathToRoot(id) {
  const path = [];
  let current = peopleById.get(id);
  const visited = new Set();
  while (current && !visited.has(current.id)) {
    path.push(current);
    visited.add(current.id);
    const parentId = (current.parents || [])[0];
    current = parentId ? peopleById.get(parentId) : null;
  }
  return path;
}

function handleSearchInput() {
  const value = searchInput.value.trim().toLowerCase();
  if (!value) {
    searchResults.classList.remove("active");
    searchResults.innerHTML = "";
    return;
  }
  const matches = state.searchIndex.filter(p => p.name.includes(value)).slice(0, 8);
  searchResults.innerHTML = matches.map(m => {
    const person = peopleById.get(m.id);
    return `<div class="result" data-id="${m.id}">${person.name}</div>`;
  }).join("");
  searchResults.classList.add("active");
  searchResults.querySelectorAll(".result").forEach(item => {
    item.onclick = () => {
      const id = item.dataset.id;
      jumpToPerson(id);
      searchResults.classList.remove("active");
    };
  });
}

function jumpToPerson(id) {
  state.selectedId = id;
  state.rootId = id;
  render();
  highlightPath(id);
}

function highlightPath(id) {
  const path = getPathToRoot(id).map(p => p.id);
  document.querySelectorAll(".node-card").forEach(card => {
    const isPath = path.includes(card.dataset.personId);
    card.classList.toggle("highlight", isPath);
    card.classList.toggle("dim", !isPath);
  });
  setTimeout(() => {
    document.querySelectorAll(".node-card").forEach(card => card.classList.remove("dim"));
  }, 1200);
}

function applyPanZoom() {
  treeStage.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.pan.zoom})`;
}

let lastWheel = 0;
fullTreeCanvas.addEventListener("wheel", (e) => {
  if (state.view !== "full") return;
  e.preventDefault();
  const now = Date.now();
  if (now - lastWheel < 30) return; // throttle
  lastWheel = now;
  const delta = Math.sign(e.deltaY) * -0.1;
  state.pan.zoom = Math.min(2, Math.max(0.6, state.pan.zoom + delta));
  applyPanZoom();
}, { passive: false });

let isPanning = false;
let start = { x: 0, y: 0 };
fullTreeCanvas.addEventListener("mousedown", (e) => {
  if (state.view !== "full") return;
  isPanning = true;
  start = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
});
window.addEventListener("mousemove", (e) => {
  if (!isPanning) return;
  state.pan.x = e.clientX - start.x;
  state.pan.y = e.clientY - start.y;
  applyPanZoom();
});
window.addEventListener("mouseup", () => { isPanning = false; });

searchInput.addEventListener("input", handleSearchInput);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const first = searchResults.querySelector(".result");
    if (first) jumpToPerson(first.dataset.id);
  }
});

el("focusModeBtn").onclick = () => {
  state.view = "focus";
  el("focusModeBtn").classList.add("active");
  el("fullTreeBtn").classList.remove("active");
  render();
};

el("fullTreeBtn").onclick = () => {
  state.view = "full";
  el("fullTreeBtn").classList.add("active");
  el("focusModeBtn").classList.remove("active");
  render();
};

el("centerBtn").onclick = () => centerOn(state.selectedId);
el("resetBtn").onclick = () => {
  state.pan = { x: 0, y: 0, zoom: 1 };
  applyPanZoom();
};

el("drawerClose").onclick = closeDrawer;

el("insightsToggle").onclick = () => {
  const content = el("insightsContent");
  const isOpen = content.style.display !== "none";
  content.style.display = isOpen ? "none" : "block";
  el("insightsToggle").setAttribute("aria-expanded", (!isOpen).toString());
};

el("minimapToggle").onclick = () => {
  const minimap = el("minimap");
  minimap.hidden = !minimap.hidden;
};

el("expandBranchBtn").onclick = () => {
  state.fullTree.expanded.add(state.selectedId);
  render();
};

el("collapseBranchBtn").onclick = () => {
  state.fullTree.expanded.delete(state.selectedId);
  render();
};

fullTreeView.querySelectorAll(".generation-controls .btn").forEach(btn => {
  btn.onclick = () => {
    const gen = btn.dataset.gen;
    if (gen === "branch") {
      state.fullTree.branchOnly = true;
    } else {
      state.fullTree.branchOnly = false;
      state.fullTree.gen = Number(gen);
    }
    render();
  };
});

window.addEventListener("keydown", (e) => {
  if (e.key === "/") {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === "Escape" && state.drawerOpen) {
    closeDrawer();
  }
  if (e.key.toLowerCase() === "c") {
    centerOn(state.selectedId || state.rootId);
  }
});

fetch("data.json")
  .then(res => res.json())
  .then(initData)
  .catch(() => initData({ people: [] }));

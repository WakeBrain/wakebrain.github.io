(() => {
  const editor = el('section', 'bd-editor');
  editor.hidden = true;
  editor.setAttribute('aria-label', 'Board editor');
  document.body.append(editor);
  let boards = [], session = null, stage, layer, svg, status, zoomLabel, picker;
  let camera = {x: 80, y: 120, z: 1}, selected = null, gesture = null, connecting = null, loadVersion = 0;
  const colours = ['', '--late', '--amber', '--color-coral', '--color-cool', '--color-ink-2', '--color-ember'];
  const post = (route, data) => api('/api/boards/' + route, {method: 'POST', body: JSON.stringify(data)});
  const button = (label, action, cls = 'btn') => {
    const b = el('button', cls, label); b.type = 'button';
    b.onclick = () => Promise.resolve().then(action).catch(e => toast(e.message));
    return b;
  };
  const uid = () => crypto.randomUUID();
  const active = s => session === s && document.body.dataset.view === 'boards';
  const setStatus = text => { if (status) status.textContent = text; };
  const editable = target => target.closest('input, textarea, select, [contenteditable="true"]');
  const point = (x, y) => {
    const rect = stage.getBoundingClientRect();
    return {x: (x - rect.left - camera.x) / camera.z, y: (y - rect.top - camera.y) / camera.z};
  };
  const centre = () => point(stage.getBoundingClientRect().left + stage.clientWidth / 2,
                            stage.getBoundingClientRect().top + stage.clientHeight / 2);

  async function refreshList() {
    boards = await api('/api/boards/list');
    if ($('c-boards')) $('c-boards').textContent = boards.length || '';
  }
  async function flush(s = session) {
    if (!s) return;
    clearTimeout(s.timer);
    if (s.saving) { await s.saving; return flush(s); }
    if (s.saved === s.revision) return;
    const revision = s.revision, canvas = JSON.parse(JSON.stringify(s.canvas));
    if (session === s) setStatus('Saving…');
    s.saving = post('save', {slug: s.slug, canvas});
    try {
      await s.saving;
      s.saved = revision;
      if (session === s) setStatus(s.saved === s.revision ? 'Demo: not saved' : 'Unsaved');
    } catch (e) {
      if (session === s) setStatus('Not saved, retrying');
      throw e;
    } finally { s.saving = null; }
    if (s.saved !== s.revision) return flush(s);
  }
  function changed() {
    const s = session;
    s.revision++;
    setStatus('Unsaved');
    clearTimeout(s.timer);
    s.timer = setTimeout(() => flush(s).catch(e => toast(e.message)), 600);
  }
  window.addEventListener('beforeunload', e => {
    if (session && session.revision !== session.saved) { e.preventDefault(); e.returnValue = ''; }
  });

  async function listView() {
    const version = ++loadVersion;
    if (session) { editor.hidden = false; return; }
    editor.hidden = true;
    render(el('p', 'nothing', 'Loading boards…'));
    try {
      await refreshList();
      if (version !== loadVersion || document.body.dataset.view !== 'boards') return;
      const head = el('div', 'head'), actions = el('div', 'acts'), rows = el('ul', 'rows');
      head.append(el('h1', null, 'Boards'), el('p', null, 'Choose a board, or start with one thought.'));
      let busy = 0;
      actions.append(button('New board', async () => {
        if (busy) return;
        busy = 1;
        try {
          const name = prompt('Board name');
          if (!name?.trim()) return;
          const result = await post('create', {name});
          await refreshList();
          await openBoard(result.slug);
        } finally { setTimeout(() => { busy = 0; }, 500); }
      }, 'btn primary'));
      boards.forEach(board => {
        const item = el('li');
        const b = button('', () => openBoard(board.slug), '');
        const when = board.edited ? new Date(board.edited).toLocaleString('en-IN', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '';
        b.append(el('b', null, board.name), el('span', 'when', when), el('span', 'sub', board.error || plural(board.cards, 'card')));
        item.append(b); rows.append(item);
      });
      render(head, actions, boards.length ? rows : el('p', 'nothing', 'No boards yet. Start a new board above.'));
    } catch (e) { if (version === loadVersion && document.body.dataset.view === 'boards') render(working("Couldn't load your boards.", e.message, true, listView)); }
  }
  async function openBoard(slug) {
    const version = ++loadVersion;
    await flush();
    const result = await api('/api/boards/get?slug=' + encodeURIComponent(slug));
    if (version !== loadVersion || document.body.dataset.view !== 'boards') return;
    session = {slug, canvas: result.canvas, previews: result.previews, revision: 0, saved: 0, timer: null, saving: null};
    selected = null; connecting = null; gesture = null;
    camera = {x: 80, y: 120, z: 1};
    buildEditor();
    fit();
  }
  function transform() {
    layer.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`;
    zoomLabel.textContent = Math.round(camera.z * 100) + '%';
  }
  function zoom(factor, x = stage.clientWidth / 2, y = stage.clientHeight / 2) {
    const old = camera.z;
    camera.z = Math.max(.1, Math.min(3, old * factor));
    camera.x = x - (x - camera.x) * camera.z / old;
    camera.y = y - (y - camera.y) * camera.z / old;
    transform();
  }
  function fit() {
    const nodes = session.canvas.nodes;
    if (!nodes.length) { camera = {x: 80, y: 120, z: 1}; transform(); return; }
    const left = Math.min(...nodes.map(n => n.x)), top = Math.min(...nodes.map(n => n.y));
    const width = Math.max(...nodes.map(n => n.x + n.width)) - left;
    const height = Math.max(...nodes.map(n => n.y + n.height)) - top;
    const toolbarHeight = editor.querySelector('.bd-toolbar').offsetHeight + 36;
    camera.z = Math.max(.1, Math.min(1.2, (stage.clientWidth - 100) / width, (stage.clientHeight - toolbarHeight - 60) / height));
    camera.x = (stage.clientWidth - width * camera.z) / 2 - left * camera.z;
    camera.y = toolbarHeight + (stage.clientHeight - toolbarHeight - height * camera.z) / 2 - top * camera.z;
    transform();
  }
  function buildEditor() {
    editor.hidden = false; editor.replaceChildren(); picker = null;
    stage = el('div', 'bd-stage'); stage.tabIndex = 0; stage.setAttribute('aria-label', 'Canvas. Double-click empty space to add text.');
    layer = el('div', 'bd-layer');
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('bd-edges');
    layer.append(svg); stage.append(layer);
    const bar = el('div', 'bd-toolbar');
    const more = el('details', 'bd-more'), morePanel = el('div', 'bd-more-panel');
    more.append(el('summary', 'btn', 'More'), morePanel);
    status = button('Demo: not saved', () => flush(), 'bd-status btn'); status.setAttribute('aria-live', 'polite');
    zoomLabel = el('span', 'bd-status', '100%');
    const colour = el('select', 'bd-colour'); colour.setAttribute('aria-label', 'Selected card colour');
    ['Default', 'Red', 'Amber', 'Coral', 'Cool', 'Ink', 'Ember'].forEach((name, i) => {
      const option = el('option', null, name); option.value = i ? String(i) : ''; colour.append(option);
    });
    colour.onchange = () => {
      const node = session.canvas.nodes.find(n => n.id === selected);
      if (!node) return;
      if (colour.value) node.color = colour.value; else delete node.color;
      changed(); drawCards();
    };
    bar.append(button('Boards', async () => { await flush(); session = null; go('boards'); }),
      el('b', 'bd-name', session.canvas.name || session.slug),
      button('Text', () => addCard('text', '')),
      button('Add note…', showPicker), button('Link', () => {
        const url = prompt('Link URL (https://…)'); if (!url) return;
        let parsed; try { parsed = new URL(url); } catch { throw new Error('Enter a complete http or https link.'); }
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Enter a complete http or https link.');
        addCard('link', parsed.href);
      }), button('Connect', () => { connecting = selected && session.canvas.nodes.some(n => n.id === selected) ? selected : true; setStatus('Choose two cards to connect'); }),
      button('−', () => zoom(1 / 1.2)), zoomLabel, button('+', () => zoom(1.2)), button('Fit', fit),
      button('Ask about this board', askBoard), more, status);
    morePanel.append(colour, button('Rename', async () => {
        const name = prompt('Board name', session.canvas.name || session.slug); if (!name?.trim()) return;
        await flush();
        editor.inert = true;
        try {
          const result = await post('rename', {slug: session.slug, name});
          session.slug = result.slug; session.canvas.name = name.trim();
          bar.querySelector('.bd-name').textContent = name.trim();
        } finally { editor.inert = false; }
        await refreshList();
      }), button('Delete board', async () => {
        if (!confirm('Delete this board? Notes in the vault stay in place.')) return;
        await flush(); await post('delete', {slug: session.slug}); session = null; go('boards');
      }));
    editor.append(stage, bar, el('div', 'bd-help', 'Double-click to add or edit. Drag to move, scroll to pan, Ctrl+scroll to zoom. Delete removes the selection.'));
    stage.addEventListener('wheel', e => {
      if (editable(e.target) || e.target.closest('.bd-content') && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage.clientHeight : 1;
      if (e.ctrlKey || e.metaKey) zoom(Math.exp(-e.deltaY * factor * .01), e.clientX - rect.left, e.clientY - rect.top);
      else { camera.x -= e.deltaX * factor; camera.y -= e.deltaY * factor; transform(); }
    }, {passive: false});
    stage.ondblclick = e => {
      if (!e.target.closest('.bd-card, [data-edge]')) addCard('text', '', point(e.clientX, e.clientY));
    };
    stage.onpointerdown = pointerDown; stage.onpointermove = pointerMove;
    stage.onpointerup = pointerUp; stage.onpointercancel = () => { gesture = null; drawEdges(); };
    drawCards(); transform();
  }
  function select(id) {
    selected = id;
    layer.querySelectorAll('.bd-card').forEach(card => card.classList.toggle('bd-selected', card.dataset.node === id));
    const node = session.canvas.nodes.find(n => n.id === id);
    editor.querySelector('.bd-colour').value = /^[1-6]$/.test(node?.color || '') ? node.color : '';
    drawEdges();
  }
  function place(card, node) {
    Object.assign(card.style, {left: node.x + 'px', top: node.y + 'px', width: node.width + 'px', height: node.height + 'px'});
  }
  function drawCards() {
    layer.querySelectorAll('.bd-card').forEach(card => card.remove());
    [...session.canvas.nodes].sort((a, b) => (a.type !== 'group') - (b.type !== 'group')).forEach(node => {
      const card = el('article', 'bd-card' + (node.type === 'group' ? ' bd-group' : node.type === 'text' ? ' bd-text' : ''));
      card.dataset.node = node.id; card.tabIndex = 0;
      card.setAttribute('aria-label', node.type + ' card'); place(card, node);
      if (colours[Number(node.color)]) card.style.borderColor = `var(${colours[Number(node.color)]})`;
      const title = node.type === 'text' ? null : el('div', 'bd-title', node.type === 'file' ? node.file.split('/').pop().replace(/\.md$/, '') : node.type === 'group' ? node.label || 'Group' : 'Link');
      const content = el('div', 'bd-content');
      if (node.type === 'text') content.append(md(node.text || 'Double-click to write.'));
      if (node.type === 'file') content.append(md(session.previews[node.file] || 'Note unavailable.'));
      if (node.type === 'link') {
        const a = el('a', null, node.url); a.href = node.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; content.append(a);
      }
      const port = el('button', 'bd-port'); port.type = 'button'; port.setAttribute('aria-label', 'Connect from this card');
      port.onclick = e => { if (e.detail === 0) connectClick(node.id); };
      const resize = el('button', 'bd-resize'); resize.type = 'button'; resize.setAttribute('aria-label', 'Resize card. Use arrow keys.');
      resize.onkeydown = e => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        node.width = Math.max(120, node.width + (e.key === 'ArrowRight' ? 20 : e.key === 'ArrowLeft' ? -20 : 0));
        node.height = Math.max(80, node.height + (e.key === 'ArrowDown' ? 20 : e.key === 'ArrowUp' ? -20 : 0));
        place(card, node); drawEdges(); changed();
      };
      card.ondblclick = e => {
        if (e.target.closest('button, a, textarea')) return;
        e.stopPropagation();
        if (node.type === 'text') editText(node, content);
        if (node.type === 'file' && typeof openNote === 'function') openNote('f:' + node.file);
      };
      card.onkeydown = e => {
        if (e.key === 'Enter' && e.target === card) {
          e.preventDefault();
          if (connecting) connectClick(node.id);
          else if (node.type === 'text') editText(node, content);
          else if (node.type === 'file' && typeof openNote === 'function') openNote('f:' + node.file);
        }
      };
      card.onfocus = () => select(node.id);
      if (title) card.append(title);
      card.append(content, port, resize); layer.append(card);
    });
    select(selected);
  }
  function editText(node, content) {
    if (content.querySelector('textarea')) return;
    const input = el('textarea'); input.value = node.text; input.setAttribute('aria-label', 'Card text');
    input.oninput = () => { node.text = input.value; changed(); };
    input.onblur = () => { content.replaceChildren(md(node.text || 'Double-click to write.')); };
    input.onkeydown = e => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); input.blur(); } };
    content.replaceChildren(input); input.focus();
  }
  function addCard(type, value, position = centre()) {
    if (session.canvas.nodes.length >= 500) { toast('This board already has 500 cards.'); return; }
    const node = {id: uid(), type, x: position.x, y: position.y, width: 280, height: 190};
    node[type === 'file' ? 'file' : type === 'link' ? 'url' : 'text'] = value;
    session.canvas.nodes.push(node); selected = node.id; changed(); drawCards();
    if (type === 'text') {
      const card = [...layer.querySelectorAll('.bd-card')].find(c => c.dataset.node === node.id);
      editText(node, card.querySelector('.bd-content'));
    }
  }
  function connectClick(id) {
    if (typeof connecting === 'string') { addEdge(connecting, id); connecting = null; }
    else { connecting = id; setStatus('Choose the destination card'); }
  }
  function addEdge(from, to) {
    if (from === to) return;
    if (session.canvas.edges.length >= 1000) { toast('This board already has 1000 connections.'); return; }
    session.canvas.edges.push({id: uid(), fromNode: from, toNode: to, fromSide: 'right', toSide: 'left', toEnd: 'arrow'});
    changed(); drawEdges();
  }
  const svgNode = (tag, attrs) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value)); return node;
  };
  function anchor(node, side) {
    const sides = {left: [node.x, node.y + node.height / 2, -1, 0], right: [node.x + node.width, node.y + node.height / 2, 1, 0],
      top: [node.x + node.width / 2, node.y, 0, -1], bottom: [node.x + node.width / 2, node.y + node.height, 0, 1]};
    return sides[side] || sides.right;
  }
  function curve(a, b) {
    const d = Math.max(50, Math.hypot(b[0] - a[0], b[1] - a[1]) * .4);
    return `M ${a[0]} ${a[1]} C ${a[0] + a[2] * d} ${a[1] + a[3] * d}, ${b[0] + b[2] * d} ${b[1] + b[3] * d}, ${b[0]} ${b[1]}`;
  }
  function drawEdges() {
    svg.replaceChildren();
    const defs = svgNode('defs', {}), marker = svgNode('marker', {id: 'bd-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse'});
    marker.append(svgNode('path', {d: 'M 0 0 L 10 5 L 0 10 Z', class: 'bd-arrow'})); defs.append(marker); svg.append(defs);
    const nodes = new Map(session.canvas.nodes.map(node => [node.id, node]));
    session.canvas.edges.forEach(edge => {
      const from = nodes.get(edge.fromNode), to = nodes.get(edge.toNode); if (!from || !to) return;
      const a = anchor(from, edge.fromSide || 'right'), b = anchor(to, edge.toSide || 'left'), d = curve(a, b);
      const path = svgNode('path', {d, class: 'bd-edge' + (selected === edge.id ? ' bd-selected' : '')});
      if (edge.toEnd !== 'none') path.setAttribute('marker-end', 'url(#bd-arrow)');
      if (edge.fromEnd === 'arrow') path.setAttribute('marker-start', 'url(#bd-arrow)');
      const hit = svgNode('path', {d, class: 'bd-edge-hit', 'data-edge': edge.id});
      svg.append(path, hit);
      if (edge.label) { const label = svgNode('text', {x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 - 8, class: 'bd-edge-label'}); label.textContent = edge.label; svg.append(label); }
    });
    if (gesture?.type === 'connect' && gesture.end) {
      const from = nodes.get(gesture.id);
      svg.append(svgNode('path', {d: curve(anchor(from, 'right'), [gesture.end.x, gesture.end.y, -1, 0]), class: 'bd-edge'}));
    }
  }
  function pointerDown(e) {
    if (e.button !== 0 || editable(e.target) || e.target.closest('a')) return;
    const card = e.target.closest('.bd-card'), edge = e.target.closest('[data-edge]');
    if (card) {
      select(card.dataset.node);
      if (connecting && !e.target.closest('.bd-resize')) { connectClick(selected); return; }
      const node = session.canvas.nodes.find(n => n.id === selected);
      const type = e.target.closest('.bd-port') ? 'connect' : e.target.closest('.bd-resize') ? 'resize' : 'move';
      gesture = {type, id: node.id, x: e.clientX, y: e.clientY, nx: node.x, ny: node.y, width: node.width, height: node.height};
    } else if (edge) { select(edge.dataset.edge); stage.focus({preventScroll: true}); return; }
    else { select(null); gesture = {type: 'pan', x: e.clientX, y: e.clientY, nx: camera.x, ny: camera.y}; }
    gesture.capture = card || stage;
    gesture.capture.setPointerCapture(e.pointerId);
  }
  function pointerMove(e) {
    if (!gesture) return;
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 3) return;
    gesture.moved = true;
    if (gesture.type === 'pan') { camera.x = gesture.nx + dx; camera.y = gesture.ny + dy; transform(); return; }
    if (gesture.type === 'connect') { gesture.end = point(e.clientX, e.clientY); drawEdges(); return; }
    const node = session.canvas.nodes.find(n => n.id === gesture.id);
    if (gesture.type === 'move') { node.x = gesture.nx + dx / camera.z; node.y = gesture.ny + dy / camera.z; }
    else { node.width = Math.max(120, gesture.width + dx / camera.z); node.height = Math.max(80, gesture.height + dy / camera.z); }
    const card = [...layer.querySelectorAll('.bd-card')].find(c => c.dataset.node === node.id);
    place(card, node); drawEdges(); changed();
  }
  function pointerUp(e) {
    if (gesture?.type === 'connect') {
      const card = document.elementFromPoint(e.clientX, e.clientY)?.closest('.bd-card');
      if (gesture.moved && card) addEdge(gesture.id, card.dataset.node);
      else if (!gesture.moved) { connecting = gesture.id; setStatus('Choose the destination card'); }
    }
    const capture = gesture?.capture;
    gesture = null;
    if (capture?.hasPointerCapture(e.pointerId)) capture.releasePointerCapture(e.pointerId);
    drawEdges();
  }
  document.addEventListener('keydown', e => {
    if (!session || document.body.dataset.view !== 'boards' || editable(e.target) || picker || e.target.closest('dialog')) return;
    if (e.key === 'Escape') { connecting = null; select(null); setStatus(session.saved === session.revision ? 'Demo: not saved' : 'Unsaved'); }
    if (['Delete', 'Backspace'].includes(e.key) && selected) {
      e.preventDefault();
      session.canvas.nodes = session.canvas.nodes.filter(n => n.id !== selected);
      session.canvas.edges = session.canvas.edges.filter(edge => edge.id !== selected && edge.fromNode !== selected && edge.toNode !== selected);
      selected = null; connecting = null; changed(); drawCards();
    }
    const node = session.canvas.nodes.find(n => n.id === selected);
    if (node && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !e.target.closest('button')) {
      e.preventDefault(); const distance = e.shiftKey ? 20 : 5;
      node.x += e.key === 'ArrowRight' ? distance : e.key === 'ArrowLeft' ? -distance : 0;
      node.y += e.key === 'ArrowDown' ? distance : e.key === 'ArrowUp' ? -distance : 0;
      changed(); drawCards();
    }
  });
  async function showPicker() {
    if (picker) { picker.remove(); picker = null; return; }
    const s = session, panel = el('section', 'bd-picker'); picker = panel;
    panel.setAttribute('aria-label', 'Add a note or open to-do');
    const search = el('input'); search.placeholder = 'Find a note or open to-do'; search.setAttribute('aria-label', search.placeholder);
    const rows = el('ul', 'rows');
    panel.append(button('Close', () => { panel.remove(); if (picker === panel) picker = null; }), search, rows);
    editor.append(panel); search.focus();
    search.onkeydown = e => { if (e.key === 'Escape') { panel.remove(); picker = null; } };
    rows.append(el('li', 'nothing', 'Loading notes…'));
    try {
      const [notes, inbox] = await Promise.all([
        api('/api/boards/notes'), api('/api/inbox/list').catch(() => ({ideas: []}))
      ]);
      if (!active(s) || picker !== panel) return;
      const items = [...(brain?.loops || []).map(loop => ({title: loop.text, text: loop.text, kind: 'Open to-do'})),
        ...(inbox.ideas || []).filter(idea => idea.status === 'inbox').map(idea => ({title: idea.text, text: idea.text, kind: 'Inbox idea'})),
        ...notes.map(note => ({...note, kind: note.file}))];
      const fill = () => {
        rows.replaceChildren();
        const matches = items.filter(item => (item.title + ' ' + item.kind).toLowerCase().includes(search.value.toLowerCase()));
        matches.slice(0, 100).forEach(item => {
          const li = el('li'), b = button('', () => {
            panel.remove(); picker = null;
            if (item.file) { s.previews[item.file] = item.preview; addCard('file', item.file); }
            else addCard('text', item.text);
          }, '');
          b.append(el('b', null, item.title), el('span', 'sub', item.kind)); li.append(b); rows.append(li);
        });
        if (!matches.length) rows.append(el('li', 'nothing', 'No matching notes or to-dos.'));
        if (matches.length > 100) rows.append(el('li', 'nothing', 'Type more to narrow the results.'));
      };
      search.oninput = fill; fill();
    } catch (e) { rows.replaceChildren(el('li', 'nothing', e.message)); }
  }
  async function askBoard() {
    const s = session;
    if (s.asking) return;
    const question = prompt('Ask about this board'); if (!question?.trim()) return;
    await flush(s); s.asking = true; setStatus('Thinking…');
    try {
      const result = await post('ask', {slug: s.slug, question});
      if (active(s)) screen(reader(question, {label: 'Board', view: 'boards'}, result.md, result.info));
    } finally { s.asking = false; if (session === s) setStatus(s.saved === s.revision ? 'Demo: not saved' : 'Unsaved'); }
  }
  registerView('boards', {render: listView, count: () => boards.length, nav: 'boards'});
  document.addEventListener('DOMContentLoaded', () => refreshList().catch(() => {}));
})();

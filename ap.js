
// ═══════════════════════════════════════════
//   KOMERCE — Application Logic v3
// ═══════════════════════════════════════════

const App = (() => {

    // ═══════════════════════════════════════════
    //   SYSTÈME MULTI-BOUTIQUES
    // ═══════════════════════════════════════════

    const SHOPS_KEY    = 'komerce_shops';      // liste des boutiques
    const ACTIVE_KEY   = 'komerce_active_shop';// boutique active

    // Retourne la liste des boutiques { id, name, color, createdAt }
    function getShops() {
        try { return JSON.parse(localStorage.getItem(SHOPS_KEY)) || []; }
        catch { return []; }
    }

    function saveShops(shops) {
        localStorage.setItem(SHOPS_KEY, JSON.stringify(shops));
    }

    function getActiveShopId() {
        return localStorage.getItem(ACTIVE_KEY) || null;
    }

    function setActiveShopId(id) {
        localStorage.setItem(ACTIVE_KEY, id);
    }

    // Clé de données pour une boutique
    function shopKey(id) { return `komerce_shop_${id}`; }

    // Charge les données d'une boutique
    function loadShopDB(shopId) {
        try {
            const raw = JSON.parse(localStorage.getItem(shopKey(shopId)));
            if (!raw) return defaultDB();
            if (!raw.accounts)      raw.accounts      = defaultDB().accounts;
            if (!raw.cashMovements) raw.cashMovements = [];
            if (!raw.cashClosings)  raw.cashClosings  = [];
            if (!raw.stockOuts)     raw.stockOuts     = [];
            if (!raw.expenses)      raw.expenses      = [];
            if (!raw.restocks)      raw.restocks      = [];
            if (!raw.gerants)       raw.gerants       = [];
            if (!raw.gardes)        raw.gardes        = [];
            if (!raw.pertes)        raw.pertes        = [];
            if (!raw.dettesGerants) raw.dettesGerants = [];
            if (!raw.clients)        raw.clients        = [];
            if (!raw.credits)        raw.credits        = [];
            if (!raw.creditsBancaires) raw.creditsBancaires = [];
            return raw;
        } catch { return defaultDB(); }
    }

    function saveShopDB(shopId, data) {
        localStorage.setItem(shopKey(shopId), JSON.stringify(data));
    }

    // Migration : si données v3 legacy existent sans boutique, les migrer
    function migrateV3Legacy() {
        const shops = getShops();
        if (shops.length > 0) return; // déjà migré
        const rawV3 = localStorage.getItem('komerce_v3');
        const rawV2 = localStorage.getItem('komerce_v2');
        const legacy = rawV3 || rawV2;
        if (!legacy) return;
        try {
            const old = JSON.parse(legacy);
            const id = uid();
            const shop = { id, name: 'Ma boutique', color: '#c8955a', createdAt: new Date().toISOString() };
            const data = {
                ...defaultDB(),
                products:    old.products    || [],
                inventories: old.inventories || {},
                expenses:    old.expenses    || [],
                restocks:    old.restocks    || [],
                accounts:    old.accounts    || defaultDB().accounts,
                cashMovements: old.cashMovements || [],
                cashClosings:  old.cashClosings  || [],
                stockOuts:     old.stockOuts     || []
            };
            saveShops([shop]);
            saveShopDB(id, data);
            setActiveShopId(id);
            console.log('Migration legacy → multi-boutiques effectuée');
        } catch(e) { console.error(e); }
    }

    let currentShopId = null;
    let db = null;

    function loadCurrentShop() {
        currentShopId = getActiveShopId();
        if (!currentShopId) return false;
        const shops = getShops();
        if (!shops.find(s => s.id === currentShopId)) return false;
        db = loadShopDB(currentShopId);
        return true;
    }

    function saveDB() {
        if (currentShopId) saveShopDB(currentShopId, db);
    }

    function getCurrentShop() {
        return getShops().find(s => s.id === currentShopId) || null;
    }

    // ─── Calculette inline (style Excel) ─────
    // Évalue une expression arithmétique simple saisie dans un champ de quantité.
    // Accepte : chiffres, +, -, *, /, (, ), virgule→point, espaces.
    // Sécurité : seuls ces caractères sont autorisés, pas d'eval sur du code arbitraire.

    function calcEval(raw) {
        // Remplacer virgule par point, nettoyer espaces
        const expr = raw.replace(/,/g, '.').replace(/\s/g, '');
        // N'autoriser que chiffres et opérateurs arithmétiques + parenthèses
        if (!/^[0-9+\-*/().]+$/.test(expr)) return null;
        // Interdire des séquences dangereuses (double opérateur hors -)
        try {
            // eslint-disable-next-line no-new-func
            const result = Function('"use strict"; return (' + expr + ')')();
            if (typeof result !== 'number' || !isFinite(result)) return null;
            // Arrondi à 4 décimales max
            return Math.round(result * 10000) / 10000;
        } catch { return null; }
    }

    function attachCalcToInput(input) {
        // Affiche un petit aperçu pendant la frappe si expression détectée
        let preview = null;

        input.addEventListener('input', () => {
            const val = input.value;
            const hasOp = /[+\-*/]/.test(val) && /[0-9]/.test(val);
            if (!hasOp) { removePreview(); return; }
            const result = calcEval(val);
            if (result !== null && String(result) !== val) {
                showPreview(result);
            } else { removePreview(); }
        });

        input.addEventListener('keydown', e => {
            if ((e.key === 'Enter' || e.key === 'Tab') && /[+\-*/]/.test(input.value)) {
                const result = calcEval(input.value);
                if (result !== null) {
                    input.value = result;
                    input.dispatchEvent(new Event('input'));
                    removePreview();
                    e.preventDefault();
                }
            }
        });

        input.addEventListener('blur', () => {
            if (/[+\-*/]/.test(input.value)) {
                const result = calcEval(input.value);
                if (result !== null) input.value = result;
            }
            removePreview();
        });

        function showPreview(val) {
            if (!preview) {
                preview = document.createElement('span');
                preview.className = 'calc-preview';
                input.parentNode.insertBefore(preview, input.nextSibling);
            }
            preview.textContent = '= ' + val;
        }

        function removePreview() {
            if (preview) { preview.remove(); preview = null; }
        }
    }

    // Observer pour attacher calcEval aux inputs de quantité ajoutés dynamiquement
    function initCalcObserver() {
        const CALC_SELECTORS = [
            '.inv-input', '.inv-out-qty',
            '#productStock', '#restockQuantity', '#editProductStock',
            '#productPrice', '#productCost',
            '#editProductPrice', '#editProductCost',
            '#restockCost',
            '#expenseAmount',
            '#transferAmount', '#movModalAmount'
        ].join(', ');
        // Attacher sur les inputs statiques
        document.querySelectorAll(CALC_SELECTORS).forEach(attachCalcToInput);
        // Observer les mutations DOM pour les inputs dynamiques
        const observer = new MutationObserver(mutations => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    if (node.matches?.(CALC_SELECTORS)) attachCalcToInput(node);
                    node.querySelectorAll?.(CALC_SELECTORS).forEach(attachCalcToInput);
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function defaultDB() {
        return {
            products: [], inventories: {}, expenses: [], restocks: [],
            accounts: [
                { id: 'cash',   name: 'Caisse',      icon: '💵', color: '#c8955a', balance: 0 },
                { id: 'mobile', name: 'Mobile Money', icon: '📱', color: '#6db87a', balance: 0 },
                { id: 'bank',   name: 'Banque',       icon: '🏦', color: '#7ab4d4', balance: 0 }
            ],
            cashMovements: [],
            cashClosings: [],
            stockOuts: [],
            gerants: [],        // { id, nom, contact }
            gardes: [],         // { date, gerantId }
            pertes: [],         // { id, date, gerantId, montant, motif, statut:'absorbée'|'imputée' }
            dettesGerants: [],  // { id, gerantId, perteId, montantInitial, restant, remboursements:[{id,date,montant,type,note}] }
            clients: [],        // { id, nom, telephone, createdAt }
            credits: [],        // { id, clientId, date, description, montantTotal, restant, statut:'actif'|'soldé', remboursements:[{id,date,montant,type,note}] }
            creditsBancaires: [] // { id, banque, montantTotal, mensualite, dateDebut, dateFin, capitalRestant, remboursements:[{id,date,montant,type,anticipé,note}], statut:'actif'|'soldé' }
        };
    }

    // ─── Utilitaires ─────────────────────────

    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function today() { return new Date().toISOString().slice(0, 10); }
    function formatDate(d) { const [y,m,day]=d.split('-'); return `${day}/${m}/${y}`; }

    function fmtGNF(n, signed = false) {
        if (n === null || n === undefined || isNaN(n)) return '—';
        const abs = Math.abs(Math.round(n));
        const str = abs.toLocaleString('fr-FR');
        const sign = n < 0 ? '−' : (signed && n > 0 ? '+' : '');
        return sign + str + ' GNF';
    }

    function toast(msg, type = 'info') {
        const el = document.getElementById('toast');
        el.textContent = msg;
        el.className = `toast ${type} show`;
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 3500);
    }

    function getProduct(id) { return db.products.find(p => p.id === id); }
    function getAccount(id) { return (db.accounts||[]).find(a => a.id === id); }

    function esc(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ─── Stock / Ventes ──────────────────────

    function getStockBefore(productId, dateStr) {
        const p = getProduct(productId); if (!p) return 0;
        const dates = Object.keys(db.inventories).filter(d => d < dateStr).sort();
        for (let i = dates.length - 1; i >= 0; i--) {
            const lastDate = dates[i];
            const inv = db.inventories[lastDate];
            if (inv && inv[productId] !== undefined) {
                let stock = inv[productId];
                (db.restocks||[]).filter(r => r.productId===productId && r.date>lastDate && r.date<dateStr)
                    .forEach(r => { stock += r.quantity; });
                return stock;
            }
        }
        let stock = p.initialStock || 0;
        (db.restocks||[]).filter(r => r.productId===productId && r.date<dateStr)
            .forEach(r => { stock += r.quantity; });
        return stock;
    }

    function getCurrentStock(productId) {
        const dates = Object.keys(db.inventories).sort();
        for (let i = dates.length - 1; i >= 0; i--) {
            const lastDate = dates[i];
            const inv = db.inventories[lastDate];
            if (inv && inv[productId] !== undefined) {
                // Stock compté ce jour + réapprovisionnements reçus APRÈS ce jour
                let stock = inv[productId];
                (db.restocks||[]).filter(r => r.productId===productId && r.date>lastDate)
                    .forEach(r => { stock += r.quantity; });
                return stock;
            }
        }
        // Aucun inventaire : stock initial + tous les réapprovisionnements
        const p = getProduct(productId); if (!p) return 0;
        let stock = p.initialStock || 0;
        (db.restocks||[]).filter(r => r.productId===productId).forEach(r => { stock += r.quantity; });
        return stock;
    }

    function computeSales() {
        const sales = [];
        Object.keys(db.inventories).sort().forEach(date => {
            const inv = db.inventories[date];
            db.products.forEach(p => {
                if (inv[p.id] === undefined) return;
                const prev = getStockBefore(p.id, date);
                const counted = inv[p.id];
                // Sorties non-vente enregistrées ce jour pour ce produit
                const outsQty = (db.stockOuts||[])
                    .filter(o => o.date === date && o.productId === p.id)
                    .reduce((s,o) => s + o.qty, 0);
                // Ventes = différence de stock MOINS les sorties non-vente
                const sold = Math.max(0, prev - counted - outsQty);
                const revenue = sold * p.salePrice;
                const cost = sold * (p.purchaseCost || 0);
                sales.push({ date, productId: p.id, productName: p.name, prev, counted, outsQty, sold, revenue, cost, margin: revenue - cost });
            });
        });
        return sales;
    }

    function getTotals(arr) {
        return arr.reduce((a,s) => { a.revenue+=s.revenue; a.cost+=s.cost; a.margin+=s.margin; return a; },
            { revenue:0, cost:0, margin:0 });
    }

    function getTotalExpenses() { return (db.expenses||[]).reduce((s,e) => s+e.amount, 0); }

    function getStockValues() {
        let purchase = 0, sale = 0;
        db.products.forEach(p => {
            const stock = getCurrentStock(p.id);
            purchase += stock * (p.purchaseCost||0);
            sale += stock * p.salePrice;
        });
        return { purchase, sale, margin: sale-purchase };
    }

    function getTodayExpectedRevenue() {
        return computeSales().filter(s => s.date === today()).reduce((s,x) => s+x.revenue, 0);
    }

    function getAccountBalance(accountId) {
        return (db.cashMovements||[]).reduce((bal, m) => {
            if (m.type==='in'       && m.accountId===accountId) return bal + m.amount;
            if (m.type==='out'      && m.accountId===accountId) return bal - m.amount;
            if (m.type==='transfer' && m.accountId===accountId) return bal - m.amount;
            if (m.type==='transfer' && m.toAccountId===accountId) return bal + m.amount;
            return bal;
        }, 0);
    }

    function getTotalLiquidity() {
        return (db.accounts||[]).reduce((s,a) => s + getAccountBalance(a.id), 0);
    }

    // ─── Navigation ──────────────────────────

    function initNav() {
        document.querySelectorAll('.nav-item').forEach(el => {
            el.addEventListener('click', e => {
                e.preventDefault();
                const tab = el.dataset.tab;
                if (tab) switchTab(tab);
                closeSidebar();
            });
        });
    }

    function switchTab(name) {
        document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        document.getElementById(name)?.classList.add('active');
        document.querySelectorAll(`[data-tab="${name}"]`).forEach(el => el.classList.add('active'));
        renderTab(name);
    }

    function renderTab(name) {
        ({dashboard:renderDashboard, products:renderProducts, inventory:renderInventory,
          sales:renderSales, expenses:renderExpenses, profit:renderProfit,
          history:renderHistory, caisse:renderCaisse, gerantscli:renderGerantsClients,
          creditsbancaires:renderCreditsBancaires})[name]?.();
    }

    function goToInventory() { switchTab('inventory'); }

    function initMobile() {
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay'; overlay.id = 'sidebarOverlay';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', closeSidebar);
        document.getElementById('menuToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
            overlay.classList.toggle('visible');
        });
        document.getElementById('mobileDate').textContent =
            new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
    }

    function closeSidebar() {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('visible');
    }

    // ─── Dashboard ───────────────────────────

    function renderDashboard() {
        document.getElementById('dashboardDate').textContent =
            new Date().toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

        const sales = computeSales();
        const totals = getTotals(sales);
        const expenses = getTotalExpenses();
        const netProfit = totals.margin - expenses;
        const netMargin = totals.revenue > 0 ? (netProfit/totals.revenue*100) : 0;
        const sv = getStockValues();
        const liquidity = getTotalLiquidity();

        document.getElementById('kpiRevenue').textContent = fmtGNF(totals.revenue);
        document.getElementById('kpiProfit').textContent = fmtGNF(netProfit);
        document.getElementById('kpiProfit').style.color = netProfit>=0 ? 'var(--green)' : 'var(--red)';
        document.getElementById('kpiMargin').textContent = netMargin.toFixed(1)+'%';
        document.getElementById('kpiMargin').style.color = netMargin>=0 ? 'var(--blue)' : 'var(--red)';
        document.getElementById('kpiStock').textContent = fmtGNF(sv.sale);
        const liqEl = document.getElementById('kpiLiquidity');
        if (liqEl) { liqEl.textContent = fmtGNF(liquidity); liqEl.style.color = liquidity>=0?'var(--green)':'var(--red)'; }

        // Recent sales
        const recent = [...sales].reverse().slice(0,6).filter(s=>s.sold>0);
        document.getElementById('emptyRecentSales').style.display = recent.length===0?'block':'none';
        document.getElementById('recentSalesList').innerHTML = recent.map(s=>`
            <div class="recent-item">
                <div><div class="recent-item-name">${esc(s.productName)}</div>
                <div class="recent-item-sub">${formatDate(s.date)} · ${s.sold} vendu(s)</div></div>
                <div class="recent-item-value">${fmtGNF(s.revenue)}</div>
            </div>`).join('');

        // Low stock
        const low = db.products.map(p=>({p,stock:getCurrentStock(p.id)}))
            .filter(({p,stock})=>stock<=(p.alertThreshold||10)).sort((a,b)=>a.stock-b.stock);
        document.getElementById('emptyLowStock').style.display = low.length===0?'block':'none';
        document.getElementById('lowStockList').innerHTML = low.map(({p,stock})=>`
            <div class="recent-item">
                <div><div class="recent-item-name">${esc(p.name)}</div>
                <div class="recent-item-sub">Seuil: ${p.alertThreshold||10}</div></div>
                <div class="recent-item-value" style="color:var(--red)">${stock} restant${stock>1?'s':''}</div>
            </div>`).join('');

        // Perf bars
        const prodRevs = {};
        sales.forEach(s => {
            if (!prodRevs[s.productId]) prodRevs[s.productId]={name:s.productName,revenue:0,sold:0};
            prodRevs[s.productId].revenue+=s.revenue; prodRevs[s.productId].sold+=s.sold;
        });
        const perfItems = Object.values(prodRevs).sort((a,b)=>b.revenue-a.revenue).slice(0,8);
        const maxRev = perfItems[0]?.revenue||1;
        const colors = ['#c8955a','#6db87a','#7ab4d4','#a88fd4','#d4736a','#d4c874','#74d4c8','#d474b4'];
        const hasPerf = perfItems.some(i=>i.sold>0);
        document.getElementById('emptyPerformance').style.display = hasPerf?'none':'block';
        document.getElementById('productPerformance').innerHTML = hasPerf ? perfItems.map((item,i)=>`
            <div class="perf-item">
                <div class="perf-header">
                    <span class="perf-name">${esc(item.name)}</span>
                    <span class="perf-value">${fmtGNF(item.revenue)} · ${item.sold} vente${item.sold>1?'s':''}</span>
                </div>
                <div class="perf-bar-track"><div class="perf-bar-fill" style="width:${(item.revenue/maxRev*100).toFixed(1)}%;background:${colors[i%colors.length]}"></div></div>
            </div>`).join('') : '';

        // Accounts mini
        const accEl = document.getElementById('dashAccountsSummary');
        if (accEl) accEl.innerHTML = (db.accounts||[]).map(a=>{
            const bal = getAccountBalance(a.id);
            return `<div class="dash-account-item">
                <span>${a.icon}</span>
                <span class="dash-account-name">${esc(a.name)}</span>
                <span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:${bal>=0?a.color:'var(--red)'};">${fmtGNF(bal)}</span>
            </div>`;
        }).join('');

        renderCBAlertsDashboard();
    }

    // ─── Products ────────────────────────────

    function renderProducts() {
        const sv = getStockValues();
        document.getElementById('stockPurchaseValue').textContent = fmtGNF(sv.purchase);
        document.getElementById('stockSaleValue').textContent = fmtGNF(sv.sale);
        document.getElementById('stockMarginValue').textContent = fmtGNF(sv.margin);

        const search = (document.getElementById('productSearch')?.value||'').toLowerCase();
        const prods = db.products.filter(p=>p.name.toLowerCase().includes(search));
        document.getElementById('productCount').textContent = `${db.products.length} produit${db.products.length!==1?'s':''}`;

        const list = document.getElementById('productsList');
        const empty = document.getElementById('emptyProducts');
        if (db.products.length===0) { list.innerHTML=''; empty.style.display='block'; return; }
        empty.style.display='none';
        list.innerHTML = prods.map(p=>{
            const stock=getCurrentStock(p.id), alert=p.alertThreshold||10;
            const isLow=stock>0&&stock<=alert, isEmpty=stock===0;
            const margin=p.salePrice-(p.purchaseCost||0);
            const marginPct=p.salePrice>0?(margin/p.salePrice*100).toFixed(0):0;
            const stockValAchat = stock * (p.purchaseCost||0);
            const stockValVente = stock * p.salePrice;
            const stockMarge    = stock * margin;
            return `<div class="product-card ${isEmpty?'no-stock':isLow?'low-stock':''}">
                <div class="product-info">
                    <div class="product-name">${esc(p.name)}</div>
                    <div class="product-meta">Vente: ${fmtGNF(p.salePrice)} · Achat: ${fmtGNF(p.purchaseCost||0)} · Marge unit.: ${fmtGNF(margin)} (${marginPct}%)</div>
                </div>
                <div class="product-stock">
                    <span class="stock-number ${isEmpty||isLow?'low':'ok'}">${stock}</span>
                    <span class="stock-label">en stock</span>
                </div>
                <div class="product-actions">
                    <button class="btn-icon" onclick="App.openEditModal('${p.id}')">✎</button>
                    <button class="btn-icon delete" onclick="App.deleteProduct('${p.id}')">✕</button>
                </div>
                <div class="product-stock-values">
                    <div class="psv-item">
                        <span class="psv-label">Valeur achat</span>
                        <span class="psv-val">${fmtGNF(stockValAchat)}</span>
                    </div>
                    <div class="psv-item">
                        <span class="psv-label">Valeur vente</span>
                        <span class="psv-val highlight">${fmtGNF(stockValVente)}</span>
                    </div>
                    <div class="psv-item">
                        <span class="psv-label">Marge stock</span>
                        <span class="psv-val ${stockMarge>0?'accent':''}">${fmtGNF(stockMarge)}</span>
                    </div>
                </div>
            </div>`;
        }).join('');

        const sel = document.getElementById('restockProduct');
        const cur = sel.value;
        sel.innerHTML = '<option value="">— Sélectionner un produit —</option>' +
            db.products.map(p=>`<option value="${p.id}"${p.id===cur?' selected':''}>${esc(p.name)}</option>`).join('');
    }

    function initProductForm() {
        document.getElementById('productForm').addEventListener('submit', e=>{
            e.preventDefault();
            const name=document.getElementById('productName').value.trim();
            const price=(v=>calcEval(v)??parseFloat(v))(document.getElementById('productPrice').value.trim());
            const cost=(v=>calcEval(v)??parseFloat(v))(document.getElementById('productCost').value.trim());
            const stockRaw=document.getElementById('productStock').value.trim();
            const stock=calcEval(stockRaw)??parseFloat(stockRaw);
            const alert=parseInt(document.getElementById('productAlert').value)||10;
            if (!name||isNaN(price)||isNaN(cost)||isNaN(stock)) return;
            db.products.push({id:uid(),name,salePrice:price,purchaseCost:cost,initialStock:stock,alertThreshold:alert});
            saveDB(); e.target.reset(); renderProducts();
            toast(`"${name}" ajouté au catalogue`,'success');
        });
        document.getElementById('productSearch').addEventListener('input', renderProducts);
    }

    function initRestockForm() {
        const sel=document.getElementById('restockProduct');
        const qty=document.getElementById('restockQuantity');
        const cost=document.getElementById('restockCost');
        function updatePreview() {
            const pid=sel.value;
            const qRaw=qty.value.trim();
            const q=calcEval(qRaw)??parseFloat(qRaw);
            const cRaw=cost.value.trim(); const c=calcEval(cRaw)??parseFloat(cRaw);
            const prev=document.getElementById('restockPreview');
            if (!pid){prev.style.display='none';return;}
            const cur=getCurrentStock(pid);
            prev.style.display='flex';
            document.getElementById('restockCurrentStock').textContent=cur;
            document.getElementById('restockNewStock').textContent=isNaN(q)?cur:cur+q;
            document.getElementById('restockTotalCost').textContent=(!isNaN(q)&&!isNaN(c))?fmtGNF(q*c):'—';
        }
        sel.addEventListener('change',updatePreview);
        qty.addEventListener('input',updatePreview);
        cost.addEventListener('input',updatePreview);
        document.getElementById('restockDate').value=today();
        document.getElementById('restockForm').addEventListener('submit', e=>{
            e.preventDefault();
            const pid=sel.value;
            const qRaw=qty.value.trim();
            const q=calcEval(qRaw)??parseFloat(qRaw);
            const cRaw=cost.value.trim(); const c=calcEval(cRaw)??parseFloat(cRaw);
            const date=document.getElementById('restockDate').value;
            if (!pid||isNaN(q)||q<=0||isNaN(c)||!date) return;
            db.restocks.push({id:uid(),productId:pid,quantity:q,unitCost:c,date});
            saveDB(); e.target.reset(); document.getElementById('restockDate').value=today();
            document.getElementById('restockPreview').style.display='none';
            renderProducts();
            toast(`Réapprovisionnement : +${q} ${getProduct(pid)?.name}`,'success');
        });
    }

    function openEditModal(id) {
        const p=getProduct(id); if (!p) return;
        document.getElementById('editProductId').value=p.id;
        document.getElementById('editProductName').value=p.name;
        document.getElementById('editProductPrice').value=p.salePrice;
        document.getElementById('editProductCost').value=p.purchaseCost||0;
        document.getElementById('editProductStock').value=p.initialStock||0;
        document.getElementById('editProductAlert').value=p.alertThreshold||10;
        document.getElementById('editModal').style.display='flex';
    }
    function closeEditModal() { document.getElementById('editModal').style.display='none'; }

    function initEditForm() {
        document.getElementById('editProductForm').addEventListener('submit', e=>{
            e.preventDefault();
            const p=getProduct(document.getElementById('editProductId').value); if (!p) return;
            p.name=document.getElementById('editProductName').value.trim();
            p.salePrice=(v=>calcEval(v)??parseFloat(v))(document.getElementById('editProductPrice').value.trim());
            p.purchaseCost=(v=>calcEval(v)??parseFloat(v))(document.getElementById('editProductCost').value.trim());
            const stockRaw=document.getElementById('editProductStock').value.trim();
            p.initialStock=calcEval(stockRaw)??parseFloat(stockRaw);
            p.alertThreshold=parseInt(document.getElementById('editProductAlert').value)||10;
            saveDB(); closeEditModal(); renderProducts(); toast('Produit mis à jour','success');
        });
        document.getElementById('editModal').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeEditModal(); });
    }

    function deleteProduct(id) {
        const p=getProduct(id); if (!p) return;
        if (!confirm(`Supprimer "${p.name}" ?`)) return;
        db.products=db.products.filter(x=>x.id!==id);
        Object.values(db.inventories).forEach(inv=>delete inv[id]);
        saveDB(); renderProducts(); toast('Produit supprimé','info');
    }

    // ─── Inventaire ──────────────────────────

    function renderInventory(clearFields=false) {
        const t=today();
        document.getElementById('inventoryDateDisplay').textContent=formatDate(t);
        const inputs=document.getElementById('inventoryInputs');
        const empty=document.getElementById('emptyInventory');
        const submitBtn=document.getElementById('inventorySubmitBtn');
        if (db.products.length===0){inputs.innerHTML='';empty.style.display='block';submitBtn.style.display='none';return;}
        empty.style.display='none'; submitBtn.style.display='block';
        const liveTotalEl = document.getElementById('invLiveTotal');
        if (liveTotalEl) liveTotalEl.style.display='flex';
        const existing=db.inventories[t]||{};
        const existingOuts={}; // productId -> { qty, reason }
        (db.stockOuts||[]).filter(o=>o.date===t).forEach(o=>{
            existingOuts[o.productId]={ qty: o.qty, reason: o.reason };
        });

        const reasonOptions = ['Casse / détérioré','Offert / cadeau','Usage personnel','Perte / vol','Autre'];

        inputs.innerHTML=db.products.map(p=>{
            const prev=getStockBefore(p.id,t);
            const savedVal=existing[p.id];
            const isSaved = savedVal !== undefined && savedVal !== null && savedVal !== '';
            const curVal = (!clearFields && isSaved) ? savedVal : '';
            const savedOut=existingOuts[p.id];
            const outQty=(!clearFields&&savedOut)?savedOut.qty:'';
            const outReason=(!clearFields&&savedOut)?savedOut.reason:'';

            return `<div class="inventory-item ${isSaved?'inv-saved':''}">
                <div class="inventory-item-row">
                    <div class="inv-product">
                        <div class="inv-product-name">${esc(p.name)} ${isSaved?'<span class="inv-saved-badge">✓ enregistré</span>':''}</div>
                        <div class="inv-product-prev">Stock précédent : <strong>${prev}</strong></div>
                    </div>
                    <div class="inv-fields">
                        <div class="inv-input-wrap">
                            <span class="inv-input-label">Compté ce soir</span>
                            <input type="text" inputmode="decimal" class="inv-input" data-product="${p.id}" data-prev="${prev}" data-price="${p.salePrice}" data-cost="${p.purchaseCost||0}" value="${curVal}" placeholder="—">
                        </div>
                        <div class="inv-out-wrap">
                            <span class="inv-input-label inv-out-label">Sorties</span>
                            <input type="text" inputmode="decimal" class="inv-out-qty" data-product="${p.id}" value="${outQty}" placeholder="0">
                            <select class="inv-out-reason" data-product="${p.id}">
                                <option value="">— Motif —</option>
                                ${reasonOptions.map(r=>`<option value="${r}"${r===outReason?' selected':''}>${r}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                <div class="inv-stats" id="inv-stats-${p.id}">
                    <div class="inv-stat"><span class="inv-stat-label">Vendus</span><span class="inv-stat-val" id="inv-sold-${p.id}">—</span></div>
                    <div class="inv-stat"><span class="inv-stat-label">CA</span><span class="inv-stat-val pos" id="inv-ca-${p.id}">—</span></div>
                    <div class="inv-stat"><span class="inv-stat-label">Marge</span><span class="inv-stat-val accent" id="inv-margin-${p.id}">—</span></div>
                </div>
            </div>`;
        }).join('');

        // Initialiser les stats pour les valeurs déjà saisies + écouter les changements
        document.querySelectorAll('#inventoryInputs .inv-input').forEach(input => {
            updateInvStats(input);
            input.addEventListener('input', () => updateInvStats(input));
            input.addEventListener('blur',  () => updateInvStats(input));
        });
        document.querySelectorAll('#inventoryInputs .inv-out-qty').forEach(input => {
            input.addEventListener('input', () => {
                const pid = input.dataset.product;
                const countInput = document.querySelector(`.inv-input[data-product="${pid}"]`);
                if (countInput) updateInvStats(countInput);
            });
        });
    }

    function updateInvStats(input) {
        const pid    = input.dataset.product;
        const prev   = parseFloat(input.dataset.prev)  || 0;
        const price  = parseFloat(input.dataset.price) || 0;
        const cost   = parseFloat(input.dataset.cost)  || 0;
        const raw    = input.value.trim();
        const counted = raw ? (calcEval(raw) ?? parseFloat(raw)) : NaN;

        const soldEl   = document.getElementById(`inv-sold-${pid}`);
        const caEl     = document.getElementById(`inv-ca-${pid}`);
        const marginEl = document.getElementById(`inv-margin-${pid}`);
        if (!soldEl || !caEl || !marginEl) return;

        if (isNaN(counted) || raw === '') {
            soldEl.textContent = '—';
            caEl.textContent   = '—';
            marginEl.textContent = '—';
            return;
        }

        const outInput = document.querySelector(`.inv-out-qty[data-product="${pid}"]`);
        const outRaw   = outInput?.value.trim() || '0';
        const outsQty  = (calcEval(outRaw) ?? parseFloat(outRaw)) || 0;
        const sold     = Math.max(0, prev - counted - outsQty);
        const revenue  = sold * price;
        const margin   = sold * (price - cost);

        soldEl.textContent   = sold;
        caEl.textContent     = fmtGNF(revenue);
        marginEl.textContent = fmtGNF(margin);

        // Recalculer le total CA de tous les produits
        updateInvTotal();
    }

    function updateInvTotal() {
        let totalCA = 0, totalMarge = 0;
        document.querySelectorAll('#inventoryInputs .inv-input').forEach(input => {
            const raw = input.value.trim();
            if (!raw) return;
            const counted = calcEval(raw) ?? parseFloat(raw);
            if (isNaN(counted)) return;
            const prev  = parseFloat(input.dataset.prev)  || 0;
            const price = parseFloat(input.dataset.price) || 0;
            const cost  = parseFloat(input.dataset.cost)  || 0;
            const pid   = input.dataset.product;
            const outInput = document.querySelector(`.inv-out-qty[data-product="${pid}"]`);
            const outRaw   = outInput?.value.trim() || '0';
            const outsQty  = (calcEval(outRaw) ?? parseFloat(outRaw)) || 0;
            const sold = Math.max(0, prev - counted - outsQty);
            totalCA    += sold * price;
            totalMarge += sold * (price - cost);
        });
        const totalEl  = document.getElementById('invTotalCA');
        const margeEl  = document.getElementById('invTotalMarge');
        if (totalEl)  totalEl.textContent  = fmtGNF(totalCA);
        if (margeEl)  margeEl.textContent  = fmtGNF(totalMarge);
    }

    function initInventoryForm() {
        document.getElementById('inventoryForm').addEventListener('submit', e=>{
            e.preventDefault();
            const t=today(); const inv={}; let filled=0;
            document.querySelectorAll('#inventoryInputs .inv-input').forEach(input=>{
                const raw = input.value.trim();
                if (raw==='') return;
                const val = calcEval(raw) ?? parseFloat(raw);
                if (!isNaN(val)) { inv[input.dataset.product]=val; filled++; input.value=val; }
            });
            if (filled===0){toast('Entrez au moins une quantité','error');return;}
            db.inventories[t]={...(db.inventories[t]||{}),...inv};

            if (!db.stockOuts) db.stockOuts=[];
            document.querySelectorAll('#inventoryInputs .inv-out-qty').forEach(input=>{
                const pid=input.dataset.product;
                const raw=input.value.trim();
                const qty = raw ? (calcEval(raw) ?? parseFloat(raw)) : NaN;
                const reason=document.querySelector(`.inv-out-reason[data-product="${pid}"]`)?.value||'';
                if (!isNaN(qty)&&qty>0) {
                    db.stockOuts=db.stockOuts.filter(o=>!(o.date===t&&o.productId===pid));
                    db.stockOuts.push({id:uid(),date:t,productId:pid,qty,reason});
                }
            });

            saveDB(); renderInventory(false); renderDashboard();
            toast('Inventaire enregistré ✓','success');
        });
        const picker=document.getElementById('historyDatePicker');
        picker.max=today();
        picker.addEventListener('change',()=>{
            const date=picker.value;
            const editContainer=document.getElementById('historyInventoryEdit');
            const updateBtn=document.getElementById('updateHistoryBtn');
            if (!date||!db.inventories[date]){editContainer.style.display='none';updateBtn.style.display='none';toast('Aucun inventaire pour cette date','error');return;}
            const inv=db.inventories[date];
            editContainer.style.display='flex'; editContainer.style.flexDirection='column'; updateBtn.style.display='block';
            editContainer.innerHTML=db.products.map(p=>`
                <div class="inventory-item">
                    <div class="inv-product"><div class="inv-product-name">${esc(p.name)}</div></div>
                    <div class="inv-input-wrap"><span class="inv-input-label">Stock</span>
                    <input type="text" inputmode="decimal" class="inv-input hist-input" data-product="${p.id}" value="${inv[p.id]!==undefined?inv[p.id]:''}" placeholder="—">
                    </div>
                </div>`).join('');
        });
        document.getElementById('updateHistoryBtn').addEventListener('click',()=>{
            const date=document.getElementById('historyDatePicker').value; if (!date) return;
            const inv=db.inventories[date]||{};
            document.querySelectorAll('.hist-input').forEach(input=>{
                const raw=input.value.trim();
                if (raw!=='') {
                    const val = calcEval(raw) ?? parseFloat(raw);
                    if (!isNaN(val)) { inv[input.dataset.product]=val; input.value=val; }
                } else delete inv[input.dataset.product];
            });
            db.inventories[date]=inv; saveDB(); toast('Inventaire corrigé et ventes recalculées ✓','success');
        });
    }

    // ─── Ventes ──────────────────────────────

    function renderSales() {
        const t=today(), allSales=computeSales();
        const todayData=allSales.filter(s=>s.date===t&&s.sold>0);
        const tC=document.getElementById('todaySales'), tE=document.getElementById('emptyTodaySales');
        const tT=document.getElementById('todaySalesTotal');
        if (todayData.length===0){tC.innerHTML='';tE.style.display='block';tT.textContent='';}
        else {
            tE.style.display='none';
            tT.textContent=fmtGNF(todayData.reduce((s,x)=>s+x.revenue,0));
            tC.innerHTML=todayData.map(s=>`<div class="sales-day-item">
                <div class="sales-item-name">${esc(s.productName)}</div>
                <div class="sales-item-qty">${s.sold} vendu${s.sold>1?'s':''}</div>
                <div class="sales-item-ca">${fmtGNF(s.revenue)}</div>
                <div class="sales-item-margin">${fmtGNF(s.margin)}</div>
            </div>`).join('');
        }
        const body=document.getElementById('salesByProductBody'), empty=document.getElementById('emptySalesByProduct');
        const search=(document.getElementById('salesSearch')?.value||'').toLowerCase();
        const filtered=allSales.filter(s=>s.sold>0||s.outsQty>0).filter(s=>
            s.productName.toLowerCase().includes(search)||s.date.includes(search));
        if (filtered.length===0){body.innerHTML='';empty.style.display='block';}
        else {
            empty.style.display='none';
            body.innerHTML=[...filtered].reverse().map(s=>`<tr>
                <td class="mono muted">${formatDate(s.date)}</td><td>${esc(s.productName)}</td>
                <td class="mono muted">${s.prev}</td><td class="mono muted">${s.counted}</td>
                <td class="mono">${s.sold}</td>
                <td class="mono" style="color:var(--red)">${s.outsQty>0?s.outsQty:'—'}</td>
                <td class="mono pos">${fmtGNF(s.revenue)}</td>
                <td class="mono" style="color:var(--accent)">${fmtGNF(s.margin)}</td>
            </tr>`).join('');
        }
    }
    function initSalesSearch() { document.getElementById('salesSearch')?.addEventListener('input',renderSales); }

    // ─── Dépenses ────────────────────────────

    const catLabels={loyer:'🏠 Loyer',electricite:'⚡ Énergie',fournitures:'📎 Fournitures',
        marketing:'📢 Marketing',salaires:'👥 Salaires',maintenance:'🔧 Maintenance',
        transport:'🚚 Transport',impots:'📋 Impôts',autre:'❓ Autre'};

    function renderCatChart(containerId, expenses) {
        const catTotals={};
        expenses.forEach(e=>{catTotals[e.category]=(catTotals[e.category]||0)+e.amount;});
        const maxCat=Math.max(...Object.values(catTotals),1);
        const el=document.getElementById(containerId); if (!el) return;
        el.innerHTML=Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([cat,val])=>`
            <div class="cat-item">
                <div class="cat-header"><span class="cat-name">${catLabels[cat]||cat}</span><span class="cat-value">${fmtGNF(val)}</span></div>
                <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${(val/maxCat*100).toFixed(1)}%"></div></div>
            </div>`).join('')||'<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">Aucune dépense</p>';
    }

    function renderExpenses() {
        const expenses=db.expenses||[];
        document.getElementById('expensesTotal').textContent=fmtGNF(getTotalExpenses());
        const body=document.getElementById('expensesBody'), empty=document.getElementById('emptyExpenses');
        if (expenses.length===0){body.innerHTML='';empty.style.display='block';}
        else {
            empty.style.display='none';
            body.innerHTML=[...expenses].reverse().map(e=>`<tr>
                <td class="mono muted">${formatDate(e.date)}</td><td>${catLabels[e.category]||e.category}</td>
                <td>${esc(e.description)}</td><td class="mono neg">${fmtGNF(e.amount)}</td>
                <td class="muted">${e.recurring==='monthly'?'Mensuelle':e.recurring==='weekly'?'Hebdo':e.recurring==='daily'?'Quotidienne':'Unique'}</td>
                <td><button class="btn-icon delete" onclick="App.deleteExpense('${e.id}')">✕</button></td>
            </tr>`).join('');
        }
        renderCatChart('expensesByCategory',expenses);
    }

    function initExpenseForm() {
        document.getElementById('expenseDate').value=today();
        document.getElementById('expenseForm').addEventListener('submit',e=>{
            e.preventDefault();
            const date=document.getElementById('expenseDate').value;
            const category=document.getElementById('expenseCategory').value;
            const description=document.getElementById('expenseDescription').value.trim();
            const amount=(v=>calcEval(v)??parseFloat(v))(document.getElementById('expenseAmount').value.trim());
            const recurring=document.getElementById('expenseRecurring').value;
            if (!date||!category||!description||isNaN(amount)||amount<=0) return;
            db.expenses.push({id:uid(),date,category,description,amount,recurring});
            saveDB(); e.target.reset(); document.getElementById('expenseDate').value=today();
            renderExpenses(); toast('Dépense enregistrée','success');
        });
    }

    function deleteExpense(id) {
        if (!confirm('Supprimer cette dépense ?')) return;
        db.expenses=db.expenses.filter(e=>e.id!==id);
        saveDB(); renderExpenses(); toast('Dépense supprimée','info');
    }

    // ─── Bénéfices ───────────────────────────

    function renderProfit() {
        const sales=computeSales(), totals=getTotals(sales);
        const expTotal=getTotalExpenses(), net=totals.margin-expTotal, sv=getStockValues();
        document.getElementById('statRevenue').textContent=fmtGNF(totals.revenue);
        document.getElementById('statCOGS').textContent=fmtGNF(totals.cost);
        document.getElementById('statExpenses').textContent=fmtGNF(expTotal);
        document.getElementById('statNetProfit').textContent=fmtGNF(net);
        document.getElementById('statNetProfit').style.color=net>=0?'var(--accent)':'var(--red)';
        document.getElementById('profitStockPurchase').textContent=fmtGNF(sv.purchase);
        document.getElementById('profitStockSale').textContent=fmtGNF(sv.sale);
        document.getElementById('profitStockMargin').textContent=fmtGNF(sv.margin);
        renderCatChart('profitExpenseBreakdown',db.expenses||[]);
        const prodRevs={};
        sales.forEach(s=>{
            if (!prodRevs[s.productId]) prodRevs[s.productId]={name:s.productName,revenue:0,margin:0};
            prodRevs[s.productId].revenue+=s.revenue; prodRevs[s.productId].margin+=s.margin;
        });
        const perfItems=Object.values(prodRevs).sort((a,b)=>b.margin-a.margin);
        const maxM=Math.max(...perfItems.map(x=>x.margin),1);
        const colors=['#c8955a','#6db87a','#7ab4d4','#a88fd4','#d4736a','#d4c874'];
        const bEl=document.getElementById('profitBreakdown');
        if (bEl) bEl.innerHTML=perfItems.length===0
            ?'<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">Aucune vente enregistrée</p>'
            :perfItems.map((item,i)=>`<div class="cat-item">
                <div class="cat-header"><span class="cat-name">${esc(item.name)}</span>
                <span class="cat-value" style="color:var(--accent)">${fmtGNF(item.margin)}</span></div>
                <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${Math.max(0,item.margin/maxM*100).toFixed(1)}%;background:${colors[i%colors.length]}"></div></div>
            </div>`).join('');
    }

    function initProfitCalculator() {
        document.getElementById('calculateProfitBtn').addEventListener('click',()=>{
            const s=document.getElementById('profitStartDate').value;
            const e=document.getElementById('profitEndDate').value;
            if (!s||!e||s>e){toast('Sélectionnez une période valide','error');return;}
            const filtered=computeSales().filter(x=>x.date>=s&&x.date<=e);
            const totals=getTotals(filtered);
            const exp=(db.expenses||[]).filter(x=>x.date>=s&&x.date<=e).reduce((a,x)=>a+x.amount,0);
            const net=totals.margin-exp;
            document.getElementById('periodRevenue').textContent=fmtGNF(totals.revenue);
            document.getElementById('periodRevenue').className='pos';
            document.getElementById('periodCOGS').textContent=fmtGNF(totals.cost);
            document.getElementById('periodCOGS').className='neg';
            document.getElementById('periodExpenses').textContent=fmtGNF(exp);
            document.getElementById('periodExpenses').className='neg';
            document.getElementById('periodNet').textContent=fmtGNF(net);
            document.getElementById('periodNet').style.color=net>=0?'var(--green)':'var(--red)';
            document.getElementById('periodMargin').textContent=(totals.revenue>0?(net/totals.revenue*100).toFixed(1):0)+'%';
            document.getElementById('profitPeriodResult').style.display='block';
        });
    }

    // ─── Historique ──────────────────────────

    function renderHistory() {
        const body=document.getElementById('inventoryHistoryBody'), empty=document.getElementById('emptyInventoryHistory');
        const search=(document.getElementById('historySearch')?.value||'').toLowerCase();
        const allSales=computeSales();
        if (allSales.length===0){body.innerHTML='';empty.style.display='block';return;}
        const filtered=allSales.filter(s=>s.productName.toLowerCase().includes(search)||s.date.includes(search)||formatDate(s.date).includes(search));
        empty.style.display=filtered.length===0?'block':'none';
        body.innerHTML=[...filtered].reverse().map(s=>`<tr>
            <td class="mono muted">${formatDate(s.date)}</td><td>${esc(s.productName)}</td>
            <td class="mono">${s.counted}</td><td class="mono">${s.sold}</td>
            <td class="mono pos">${s.sold>0?fmtGNF(s.revenue):'—'}</td>
            <td class="mono" style="color:var(--accent)">${s.sold>0?fmtGNF(s.margin):'—'}</td>
        </tr>`).join('');
    }
    function initHistorySearch() { document.getElementById('historySearch')?.addEventListener('input',renderHistory); }

    // ═══════════════════════════════════════════
    //   MODULE CAISSE
    // ═══════════════════════════════════════════

    function renderCaisse() {
        renderAccountsBar();
        renderCashClosingSection();
        renderMovementsTable();
        renderTransferForm();
    }

    function renderAccountsBar() {
        const total=getTotalLiquidity();
        document.getElementById('totalLiquidity').textContent=fmtGNF(total);
        document.getElementById('totalLiquidity').style.color=total>=0?'var(--green)':'var(--red)';

        document.getElementById('accountsBar').innerHTML=(db.accounts||[]).map(a=>{
            const bal=getAccountBalance(a.id);
            return `<div class="account-card" style="border-top-color:${a.color}">
                <div class="account-card-top">
                    <span class="account-card-icon">${a.icon}</span>
                    <div class="account-card-actions">
                        <button class="btn-icon" onclick="App.openMovementModal('in','${a.id}')" title="Entrée">＋</button>
                        <button class="btn-icon delete" onclick="App.openMovementModal('out','${a.id}')" title="Sortie">－</button>
                    </div>
                </div>
                <div class="account-card-name">${esc(a.name)}</div>
                <div class="account-card-balance" style="color:${bal>=0?a.color:'var(--red)'}">
                    ${fmtGNF(bal)}
                </div>
            </div>`;
        }).join('');
    }

    function renderCashClosingSection() {
        const t=today();
        const expectedRevenue=getTodayExpectedRevenue();
        const todayExpenses=(db.expenses||[]).filter(e=>e.date===t).reduce((s,e)=>s+e.amount,0);
        const todayClosings=(db.cashClosings||[]).filter(c=>c.date===t);

        // Sélecteur gérant du jour
        const gerantSel = document.getElementById('closingGerantSelect');
        if (gerantSel) {
            const gardeAujourd = (db.gardes||[]).find(g=>g.date===t);
            gerantSel.innerHTML = '<option value="">— Sélectionner le gérant du jour —</option>' +
                (db.gerants||[]).map(g=>`<option value="${g.id}"${gardeAujourd?.gerantId===g.id?' selected':''}>${esc(g.nom)}</option>`).join('');
        }

        document.getElementById('closingExpectedRevenue').textContent=fmtGNF(expectedRevenue);
        document.getElementById('closingTodayExpenses').textContent=fmtGNF(todayExpenses);
        document.getElementById('closingExpectedNet').textContent=fmtGNF(expectedRevenue-todayExpenses);

        // Historique clôtures du jour
        const histWrap=document.getElementById('closingHistoryWrap');
        const histList=document.getElementById('closingHistoryList');
        if (todayClosings.length>0) {
            histWrap.style.display='block';
            histList.innerHTML=todayClosings.map(c=>{
                const gapColor=c.gap>0?'var(--green)':c.gap<0?'var(--red)':'var(--text-muted)';
                return `<div class="closing-record">
                    <div class="closing-record-head">
                        <span>Clôture validée à ${formatDate(c.date)}</span>
                        <span class="closing-record-gap" style="color:${gapColor}">${fmtGNF(c.gap,true)}</span>
                    </div>
                    <div class="closing-record-detail">
                        Attendu: ${fmtGNF(c.expectedRevenue)} &nbsp;·&nbsp; Encaissé réel: ${fmtGNF(c.realTotal)}
                        ${c.note?` &nbsp;·&nbsp; <em>${esc(c.note)}</em>`:''}
                    </div>
                    <div class="closing-record-accounts">
                        ${(db.accounts||[]).map(a=>`${a.icon} ${fmtGNF(c.realAmounts[a.id]||0)}`).join(' &nbsp;·&nbsp; ')}
                    </div>
                </div>`;
            }).join('');
        } else { histWrap.style.display='none'; }

        // Inputs montants réels
        const realInputs=document.getElementById('closingRealInputs');
        realInputs.innerHTML=(db.accounts||[]).map(a=>`
            <div class="field">
                <label class="field-label">${a.icon} ${esc(a.name)}</label>
                <input type="number" class="field-input closing-real-input" data-account="${a.id}" min="0" placeholder="Montant compté" step="1">
            </div>`).join('');

        document.querySelectorAll('.closing-real-input').forEach(inp=>inp.addEventListener('input',updateClosingGap));
        updateClosingGap();
    }

    function updateClosingGap() {
        const expected=getTodayExpectedRevenue();
        let real=0;
        document.querySelectorAll('.closing-real-input').forEach(inp=>{
            const v=parseFloat(inp.value); if (!isNaN(v)) real+=v;
        });
        const gap=real-expected;
        const gapEl=document.getElementById('closingLiveGap');
        const realEl=document.getElementById('closingLiveReal');
        if (realEl) realEl.textContent=fmtGNF(real);
        if (gapEl) {
            gapEl.textContent=fmtGNF(gap,true);
            gapEl.style.color=gap>0?'var(--green)':gap<0?'var(--red)':'var(--text-muted)';
        }
    }

    function validateClosing() {
        const t=today();
        const expectedRevenue=getTodayExpectedRevenue();
        const todayExpenses=(db.expenses||[]).filter(e=>e.date===t).reduce((s,e)=>s+e.amount,0);
        const realAmounts={}; let realTotal=0;
        document.querySelectorAll('.closing-real-input').forEach(inp=>{
            const v=parseFloat(inp.value)||0;
            realAmounts[inp.dataset.account]=v;
            realTotal+=v;
        });
        if (realTotal===0&&!confirm('Le total encaissé est 0. Confirmer quand même ?')) return;

        // Gérant du jour
        const gerantId = document.getElementById('closingGerantSelect')?.value || '';
        if (!gerantId && (db.gerants||[]).length > 0) {
            toast('Sélectionnez le gérant responsable du jour', 'error'); return;
        }

        const gap=realTotal-expectedRevenue;
        const note=document.getElementById('closingNote')?.value.trim()||'';
        if (!db.cashClosings) db.cashClosings=[];
        const closingId=uid();
        db.cashClosings.push({id:closingId,date:t,expectedRevenue,todayExpenses,realAmounts,realTotal,gap,note,gerantId,validated:true});

        // Enregistrer la garde du jour
        if (gerantId) {
            db.gardes = (db.gardes||[]).filter(g=>g.date!==t);
            db.gardes.push({ date:t, gerantId });
        }

        // Mouvements automatiques
        (db.accounts||[]).forEach(a=>{
            const amount=realAmounts[a.id]||0;
            if (amount>0) db.cashMovements.push({id:uid(),date:t,type:'in',accountId:a.id,amount,
                label:`Ventes encaissées ${formatDate(t)}`,ref:closingId});
        });
        if (todayExpenses>0) db.cashMovements.push({id:uid(),date:t,type:'out',accountId:'cash',
            amount:todayExpenses,label:`Dépenses ${formatDate(t)}`,ref:closingId});

        saveDB();

        // Gestion perte si écart négatif
        if (gap < 0) {
            const montantPerte = Math.abs(gap);
            const gerant = (db.gerants||[]).find(g=>g.id===gerantId);
            const gerantNom = gerant ? gerant.nom : 'Gérant inconnu';
            setTimeout(() => {
                showPerteModal(montantPerte, gerantId, gerantNom, t, closingId);
            }, 300);
        } else {
            renderCaisse(); renderDashboard();
            const msg = gap===0 ? 'Clôture parfaite ✓ — Caisse équilibrée'
                : `Excédent de ${fmtGNF(gap,true)} en caisse`;
            toast(msg, 'success');
        }
    }

    function showPerteModal(montant, gerantId, gerantNom, date, closingId) {
        document.getElementById('perteModalMontant').textContent = fmtGNF(montant);
        document.getElementById('perteModalGerant').textContent  = gerantNom;
        document.getElementById('perteModalDate').textContent    = formatDate(date);
        document.getElementById('perteModal').dataset.montant    = montant;
        document.getElementById('perteModal').dataset.gerantId   = gerantId;
        document.getElementById('perteModal').dataset.date       = date;
        document.getElementById('perteModal').dataset.closingId  = closingId;
        document.getElementById('perteMotif').value = '';
        document.getElementById('perteModal').style.display = 'flex';
    }

    function closePerteModal() { document.getElementById('perteModal').style.display='none'; }

    function handlePerte(statut) {
        const modal    = document.getElementById('perteModal');
        const montant  = parseFloat(modal.dataset.montant);
        const gerantId = modal.dataset.gerantId;
        const date     = modal.dataset.date;
        const motif    = document.getElementById('perteMotif').value.trim();
        const perteId  = uid();

        db.pertes.push({ id:perteId, date, gerantId, montant, motif, statut, closingId: modal.dataset.closingId });

        if (statut === 'imputée') {
            db.dettesGerants.push({
                id: uid(), gerantId, perteId,
                montantInitial: montant, restant: montant,
                remboursements: []
            });
        }

        saveDB(); closePerteModal(); renderCaisse(); renderDashboard();
        toast(statut==='imputée'
            ? `Perte de ${fmtGNF(montant)} imputée au gérant`
            : `Perte de ${fmtGNF(montant)} absorbée par la boutique`, 'info');
    }

    function openMovementModal(type, accountId) {
        const a=getAccount(accountId);
        document.getElementById('movModalType').value=type;
        document.getElementById('movModalAccount').value=accountId;
        document.getElementById('movModalDate').value=today();
        document.getElementById('movModalAmount').value='';
        document.getElementById('movModalLabel').value='';
        const titleEl=document.getElementById('movModalTitle');
        titleEl.textContent=`${type==='in'?'Entrée':'Sortie'} — ${a?.icon||''} ${a?.name||''}`;
        titleEl.style.color=type==='in'?'var(--green)':'var(--red)';
        document.getElementById('movementModal').style.display='flex';
    }

    function closeMovementModal() { document.getElementById('movementModal').style.display='none'; }

    function initMovementModal() {
        document.getElementById('movementModal').addEventListener('click',e=>{
            if (e.target===e.currentTarget) closeMovementModal();
        });
        document.getElementById('movModalForm').addEventListener('submit',e=>{
            e.preventDefault();
            const type=document.getElementById('movModalType').value;
            const accountId=document.getElementById('movModalAccount').value;
            const date=document.getElementById('movModalDate').value;
            const amount=(v=>calcEval(v)??parseFloat(v))(document.getElementById('movModalAmount').value.trim());
            const label=document.getElementById('movModalLabel').value.trim();
            if (!date||isNaN(amount)||amount<=0||!label) return;
            db.cashMovements.push({id:uid(),date,type,accountId,amount,label});
            saveDB(); closeMovementModal(); renderCaisse();
            toast(`${type==='in'?'+':'-'}${fmtGNF(amount)} enregistré`,'success');
        });
    }

    function renderTransferForm() {
        ['transferFrom','transferTo'].forEach(id=>{
            const sel=document.getElementById(id); if (!sel) return;
            const cur=sel.value;
            sel.innerHTML=(db.accounts||[]).map(a=>`<option value="${a.id}"${a.id===cur?' selected':''}>${a.icon} ${esc(a.name)}</option>`).join('');
        });
    }

    function initTransferForm() {
        document.getElementById('transferDate').value=today();
        document.getElementById('transferForm').addEventListener('submit',e=>{
            e.preventDefault();
            const fromId=document.getElementById('transferFrom').value;
            const toId=document.getElementById('transferTo').value;
            const amount=(v=>calcEval(v)??parseFloat(v))(document.getElementById('transferAmount').value.trim());
            const date=document.getElementById('transferDate').value;
            const label=document.getElementById('transferLabel').value.trim()||'Virement';
            if (fromId===toId){toast('Source et destination identiques','error');return;}
            if (isNaN(amount)||amount<=0){toast('Montant invalide','error');return;}
            db.cashMovements.push({id:uid(),date,type:'transfer',accountId:fromId,toAccountId:toId,amount,label});
            saveDB(); e.target.reset(); document.getElementById('transferDate').value=today();
            renderCaisse(); toast(`Virement de ${fmtGNF(amount)} effectué`,'success');
        });
    }

    function renderMovementsTable() {
        const body=document.getElementById('movementsBody'), empty=document.getElementById('emptyMovements');
        const search=(document.getElementById('movementsSearch')?.value||'').toLowerCase();
        const movements=(db.cashMovements||[]).filter(m=>
            m.label?.toLowerCase().includes(search)||m.date?.includes(search));
        if (movements.length===0){body.innerHTML='';empty.style.display='block';return;}
        empty.style.display='none';
        const accMap={}; (db.accounts||[]).forEach(a=>{accMap[a.id]=a;});
        body.innerHTML=[...movements].reverse().map(m=>{
            const acc=accMap[m.accountId];
            let typeHtml, amountHtml;
            if (m.type==='in'){
                typeHtml=`<span class="mov-type in">↓ Entrée</span>`;
                amountHtml=`<span class="mono pos">+${fmtGNF(m.amount)}</span>`;
            } else if (m.type==='out'){
                typeHtml=`<span class="mov-type out">↑ Sortie</span>`;
                amountHtml=`<span class="mono neg">−${fmtGNF(m.amount)}</span>`;
            } else {
                const toAcc=accMap[m.toAccountId];
                typeHtml=`<span class="mov-type transfer">⇄ Virement</span>`;
                amountHtml=`<span class="mono muted">${fmtGNF(m.amount)}</span> <span style="font-size:11px;color:var(--text-muted)">→ ${toAcc?.icon||''} ${toAcc?.name||'?'}</span>`;
            }
            return `<tr>
                <td class="mono muted">${formatDate(m.date)}</td>
                <td>${typeHtml}</td>
                <td>${acc?acc.icon+' '+esc(acc.name):'—'}</td>
                <td>${esc(m.label)}</td>
                <td>${amountHtml}</td>
                <td><button class="btn-icon delete" onclick="App.deleteMovement('${m.id}')">✕</button></td>
            </tr>`;
        }).join('');
    }

    function deleteMovement(id) {
        if (!confirm('Supprimer ce mouvement ?')) return;
        db.cashMovements=(db.cashMovements||[]).filter(m=>m.id!==id);
        saveDB(); renderCaisse(); toast('Mouvement supprimé','info');
    }

    // ═══════════════════════════════════════════
    //   MODULE GÉRANTS & DETTES
    // ═══════════════════════════════════════════

    function renderGerantsClients() {
        const subTab = document.querySelector('.gc-tab.active')?.dataset.sub || 'gerants';
        if (subTab === 'gerants') renderGerants();
        else renderClients();
    }

    function switchGCTab(sub) {
        document.querySelectorAll('.gc-tab').forEach(t=>t.classList.remove('active'));
        document.querySelectorAll(`.gc-tab[data-sub="${sub}"]`).forEach(t=>t.classList.add('active'));
        document.getElementById('gcGerantsPane').style.display = sub==='gerants'?'block':'none';
        document.getElementById('gcClientsPane').style.display = sub==='clients'?'block':'none';
        if (sub==='gerants') renderGerants();
        else renderClients();
    }

    // ── Gérants ──────────────────────────────

    function renderGerants() {
        // Stats globales
        const totalDettes = (db.dettesGerants||[]).reduce((s,d)=>s+d.restant,0);
        const totalPertes = (db.pertes||[]).reduce((s,p)=>s+p.montant,0);
        document.getElementById('gerantTotalDettes').textContent = fmtGNF(totalDettes);
        document.getElementById('gerantTotalPertes').textContent = fmtGNF(totalPertes);

        const list = document.getElementById('gerantsList');
        const empty = document.getElementById('emptyGerants');
        const gerants = db.gerants||[];

        if (gerants.length===0) { list.innerHTML=''; empty.style.display='block'; return; }
        empty.style.display='none';

        list.innerHTML = gerants.map(g => {
            const gardes = (db.gardes||[]).filter(x=>x.gerantId===g.id);
            const pertes  = (db.pertes||[]).filter(x=>x.gerantId===g.id);
            const dettes  = (db.dettesGerants||[]).filter(x=>x.gerantId===g.id);
            const restant = dettes.reduce((s,d)=>s+d.restant,0);
            const closings = (db.cashClosings||[]).filter(c=>c.gerantId===g.id);
            return `
            <div class="gerant-card">
                <div class="gerant-card-header">
                    <div class="gerant-avatar">${g.nom[0].toUpperCase()}</div>
                    <div class="gerant-info">
                        <div class="gerant-nom">${esc(g.nom)}</div>
                        <div class="gerant-contact">${g.contact ? esc(g.contact) : 'Aucun contact'}</div>
                    </div>
                    <div class="gerant-actions">
                        <button class="btn-icon delete" onclick="App.deleteGerant('${g.id}')">✕</button>
                    </div>
                </div>
                <div class="gerant-stats">
                    <div class="gerant-stat"><span class="gerant-stat-label">Jours de garde</span><span class="gerant-stat-val">${gardes.length}</span></div>
                    <div class="gerant-stat"><span class="gerant-stat-label">Clôtures</span><span class="gerant-stat-val">${closings.length}</span></div>
                    <div class="gerant-stat"><span class="gerant-stat-label">Pertes totales</span><span class="gerant-stat-val neg">${fmtGNF(pertes.reduce((s,p)=>s+p.montant,0))}</span></div>
                    <div class="gerant-stat"><span class="gerant-stat-label">Dette restante</span><span class="gerant-stat-val ${restant>0?'neg':'ok'}">${fmtGNF(restant)}</span></div>
                </div>
                ${dettes.filter(d=>d.restant>0).length>0?`
                <div class="gerant-dettes">
                    <div class="gerant-section-title">Dettes en cours</div>
                    ${dettes.filter(d=>d.restant>0).map(d=>`
                        <div class="dette-row">
                            <div class="dette-info">
                                <span class="dette-montant neg">${fmtGNF(d.restant)}</span>
                                <span class="dette-detail">sur ${fmtGNF(d.montantInitial)} · ${formatDate(d.remboursements.length>0?d.remboursements[d.remboursements.length-1].date:(db.pertes.find(p=>p.id===d.perteId)?.date||''))}</span>
                            </div>
                            <button class="btn-ghost" onclick="App.openRembModal('gerant','${d.id}')">Rembourser</button>
                        </div>`).join('')}
                </div>`:``}
                ${closings.length>0?`
                <details class="gerant-history">
                    <summary>Historique clôtures (${closings.length})</summary>
                    <div class="gerant-history-list">
                        ${[...closings].reverse().slice(0,10).map(c=>{
                            const gapColor=c.gap>0?'var(--green)':c.gap<0?'var(--red)':'var(--text-muted)';
                            return `<div class="history-row">
                                <span class="mono muted">${formatDate(c.date)}</span>
                                <span>Attendu: ${fmtGNF(c.expectedRevenue)}</span>
                                <span>Réel: ${fmtGNF(c.realTotal)}</span>
                                <span style="color:${gapColor};font-family:'JetBrains Mono',monospace">${fmtGNF(c.gap,true)}</span>
                            </div>`;
                        }).join('')}
                    </div>
                </details>`:``}
            </div>`;
        }).join('');
    }

    function deleteGerant(id) {
        const g=(db.gerants||[]).find(x=>x.id===id);
        if (!g||!confirm(`Supprimer le gérant "${g.nom}" ?`)) return;
        db.gerants=db.gerants.filter(x=>x.id!==id);
        saveDB(); renderGerants(); toast('Gérant supprimé','info');
    }

    function initGerantForm() {
        document.getElementById('gerantForm')?.addEventListener('submit',e=>{
            e.preventDefault();
            const nom=document.getElementById('gerantNom').value.trim();
            const contact=document.getElementById('gerantContact').value.trim();
            if (!nom) return;
            if (!db.gerants) db.gerants=[];
            db.gerants.push({id:uid(),nom,contact});
            saveDB(); e.target.reset(); renderGerants();
            toast(`Gérant "${nom}" ajouté`,'success');
        });
    }

    // ── Clients & Crédits ─────────────────────

    function renderClients() {
        const totalCredits = (db.credits||[]).filter(c=>c.statut==='actif').reduce((s,c)=>s+c.restant,0);
        document.getElementById('clientTotalCredits').textContent = fmtGNF(totalCredits);
        document.getElementById('clientCount').textContent = `${(db.clients||[]).length} client${(db.clients||[]).length>1?'s':''}`;

        const search=(document.getElementById('clientSearch')?.value||'').toLowerCase();
        const clients=(db.clients||[]).filter(c=>c.nom.toLowerCase().includes(search)||c.telephone?.includes(search));
        const list=document.getElementById('clientsList');
        const empty=document.getElementById('emptyClients');

        if ((db.clients||[]).length===0){list.innerHTML='';empty.style.display='block';return;}
        empty.style.display='none';

        const typeLabels = { 'espèces':'💵 Espèces', 'mobile':'📱 Mobile Money', 'salaire':'👥 Salaire' };

        list.innerHTML=clients.map(c=>{
            const credits=(db.credits||[]).filter(x=>x.clientId===c.id);
            const actifs=credits.filter(x=>x.statut==='actif');
            const soldes=credits.filter(x=>x.statut==='soldé');
            const restant=actifs.reduce((s,x)=>s+x.restant,0);
            const totalRembourse=credits.reduce((s,cr)=>s+(cr.montantTotal-cr.restant),0);

            // Historique complet : tous les remboursements de tous les crédits
            const allRembs = credits.flatMap(cr =>
                (cr.remboursements||[]).map(r => ({...r, creditDesc: cr.description, creditId: cr.id}))
            ).sort((a,b) => b.date.localeCompare(a.date));

            return `
            <div class="client-card">
                <div class="client-card-header">
                    <div class="client-avatar">${c.nom[0].toUpperCase()}</div>
                    <div class="client-info">
                        <div class="client-nom">${esc(c.nom)}</div>
                        <div class="client-tel">${c.telephone||'—'}</div>
                    </div>
                    <div class="client-dette-badge ${restant>0?'active':''}">
                        ${restant>0?`<span class="neg">${fmtGNF(restant)}</span> dû`:'À jour ✓'}
                    </div>
                    <div class="client-actions">
                        <button class="btn-ghost" onclick="App.openCreditModal('${c.id}')">+ Crédit</button>
                        <button class="btn-icon delete" onclick="App.deleteClient('${c.id}')">✕</button>
                    </div>
                </div>

                ${actifs.length>0?`
                <div class="client-credits">
                    <div class="gerant-section-title">Crédits en cours</div>
                    ${actifs.map(cr=>`
                        <div class="credit-block">
                            <div class="credit-block-header">
                                <div>
                                    <div class="credit-desc">${esc(cr.description)}</div>
                                    <div class="credit-meta">${formatDate(cr.date)} · Total: ${fmtGNF(cr.montantTotal)}</div>
                                </div>
                                <div class="credit-block-right">
                                    <span class="credit-restant neg">${fmtGNF(cr.restant)}</span>
                                    <button class="btn-ghost" onclick="App.openRembModal('client','${cr.id}')">Rembourser</button>
                                </div>
                            </div>
                            <div class="credit-progress-track">
                                <div class="credit-progress-fill" style="width:${((cr.montantTotal-cr.restant)/cr.montantTotal*100).toFixed(1)}%"></div>
                            </div>
                            <div class="credit-progress-label">
                                <span>${fmtGNF(cr.montantTotal-cr.restant)} remboursé</span>
                                <span>${((cr.montantTotal-cr.restant)/cr.montantTotal*100).toFixed(0)}%</span>
                            </div>
                        </div>`).join('')}
                </div>`:``}

                ${allRembs.length>0?`
                <details class="client-history">
                    <summary>Historique remboursements (${allRembs.length}) · ${fmtGNF(totalRembourse)} reçu</summary>
                    <div class="client-history-table">
                        <table class="data-table">
                            <thead><tr>
                                <th>Date</th><th>Crédit</th><th>Montant</th><th>Mode</th><th>Note</th>
                            </tr></thead>
                            <tbody>
                            ${allRembs.map(r=>`<tr>
                                <td class="mono muted">${formatDate(r.date)}</td>
                                <td>${esc(r.creditDesc)}</td>
                                <td class="mono pos">${fmtGNF(r.montant)}</td>
                                <td>${typeLabels[r.type]||r.type}</td>
                                <td class="muted">${r.note?esc(r.note):'—'}</td>
                            </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </details>`:``}

                ${soldes.length>0?`
                <details class="client-history">
                    <summary>Crédits soldés (${soldes.length})</summary>
                    <div class="client-history-list">
                    ${soldes.map(cr=>`
                        <div class="history-row">
                            <span class="mono muted">${formatDate(cr.date)}</span>
                            <span>${esc(cr.description)}</span>
                            <span class="mono">${fmtGNF(cr.montantTotal)}</span>
                            <span class="ok" style="color:var(--green)">Soldé ✓</span>
                        </div>`).join('')}
                    </div>
                </details>`:``}
            </div>`;
        }).join('');
    }

    function deleteClient(id) {
        const c=(db.clients||[]).find(x=>x.id===id);
        if (!c||!confirm(`Supprimer le client "${c.nom}" et tous ses crédits ?`)) return;
        db.clients=db.clients.filter(x=>x.id!==id);
        db.credits=(db.credits||[]).filter(x=>x.clientId!==id);
        saveDB(); renderClients(); toast('Client supprimé','info');
    }

    function initClientForm() {
        document.getElementById('clientForm')?.addEventListener('submit',e=>{
            e.preventDefault();
            const nom=document.getElementById('clientNom').value.trim();
            const telephone=document.getElementById('clientTel').value.trim();
            if (!nom) return;
            if (!db.clients) db.clients=[];
            db.clients.push({id:uid(),nom,telephone,createdAt:today()});
            saveDB(); e.target.reset(); renderClients();
            toast(`Client "${nom}" ajouté`,'success');
        });
        document.getElementById('clientSearch')?.addEventListener('input',renderClients);
    }

    // ── Modal crédit ──────────────────────────

    function openCreditModal(clientId) {
        const c=(db.clients||[]).find(x=>x.id===clientId); if (!c) return;
        document.getElementById('creditModalClientName').textContent=c.nom;
        document.getElementById('creditClientId').value=clientId;
        document.getElementById('creditDate').value=today();
        document.getElementById('creditDescription').value='';
        document.getElementById('creditMontant').value='';
        document.getElementById('creditModal').style.display='flex';
    }

    function closeCreditModal() { document.getElementById('creditModal').style.display='none'; }

    function initCreditModal() {
        document.getElementById('creditModal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeCreditModal();});
        document.getElementById('creditForm')?.addEventListener('submit',e=>{
            e.preventDefault();
            const clientId=document.getElementById('creditClientId').value;
            const date=document.getElementById('creditDate').value;
            const description=document.getElementById('creditDescription').value.trim();
            const raw=document.getElementById('creditMontant').value.trim();
            const montant=calcEval(raw)??parseFloat(raw);
            if (!clientId||!date||!description||isNaN(montant)||montant<=0) return;
            if (!db.credits) db.credits=[];
            db.credits.push({id:uid(),clientId,date,description,montantTotal:montant,restant:montant,statut:'actif',remboursements:[]});
            saveDB(); closeCreditModal(); renderClients();
            toast(`Crédit de ${fmtGNF(montant)} enregistré`,'success');
        });
    }

    // ── Modal remboursement (gérant ou client) ─

    function openRembModal(type, id) {
        document.getElementById('rembModal').dataset.type=type;
        document.getElementById('rembModal').dataset.id=id;
        document.getElementById('rembDate').value=today();
        document.getElementById('rembMontant').value='';
        document.getElementById('rembNote').value='';
        const typeLabel=type==='gerant'?'Remboursement gérant':'Remboursement client';
        document.getElementById('rembModalTitle').textContent=typeLabel;
        // Afficher/masquer l'option Mobile Money selon le type
        const mobileOpt=document.getElementById('rembTypeMobile');
        if (mobileOpt) mobileOpt.style.display=type==='client'?'':'none';
        document.getElementById('rembModal').style.display='flex';
    }

    function closeRembModal() { document.getElementById('rembModal').style.display='none'; }

    function initRembModal() {
        document.getElementById('rembModal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeRembModal();});
        document.getElementById('rembForm')?.addEventListener('submit',e=>{
            e.preventDefault();
            const type=document.getElementById('rembModal').dataset.type;
            const id=document.getElementById('rembModal').dataset.id;
            const date=document.getElementById('rembDate').value;
            const raw=document.getElementById('rembMontant').value.trim();
            const montant=calcEval(raw)??parseFloat(raw);
            const rembType=document.getElementById('rembType').value;
            const note=document.getElementById('rembNote').value.trim();
            if (!date||isNaN(montant)||montant<=0) return;

            const remb={id:uid(),date,montant,type:rembType,note};

            if (type==='gerant') {
                const dette=(db.dettesGerants||[]).find(d=>d.id===id); if (!dette) return;
                dette.remboursements.push(remb);
                dette.restant=Math.max(0,dette.restant-montant);
                if (dette.restant===0) dette.statut='soldée';
                // Si espèces → entrée caisse
                if (rembType==='espèces') db.cashMovements.push({id:uid(),date,type:'in',accountId:'cash',
                    amount:montant,label:`Remboursement gérant — ${note||'dette'}`});
                if (rembType==='salaire') db.cashMovements.push({id:uid(),date,type:'out',accountId:'cash',
                    amount:montant,label:`Retenue salaire gérant — ${note||'dette'}`});
            } else {
                const credit=(db.credits||[]).find(c=>c.id===id); if (!credit) return;
                credit.remboursements.push(remb);
                credit.restant=Math.max(0,credit.restant-montant);
                if (credit.restant===0) credit.statut='soldé';
                // Entrée caisse
                const accountId=rembType==='mobile'?'mobile':'cash';
                db.cashMovements.push({id:uid(),date,type:'in',accountId,
                    amount:montant,label:`Remboursement client — ${note||credit.description}`});
            }

            saveDB(); closeRembModal();
            if (type==='gerant') renderGerants(); else renderClients();
            toast(`Remboursement de ${fmtGNF(montant)} enregistré`,'success');
        });
    }

    // ═══════════════════════════════════════════
    //   MODULE CRÉDITS BANCAIRES
    // ═══════════════════════════════════════════

    function renderCreditsBancaires() {
        const cbs = db.creditsBancaires||[];
        const actifs = cbs.filter(c=>c.statut==='actif');
        const totalRestant = actifs.reduce((s,c)=>s+c.capitalRestant,0);
        const totalMensuel = actifs.reduce((s,c)=>s+c.mensualite,0);

        document.getElementById('cbTotalRestant').textContent = fmtGNF(totalRestant);
        document.getElementById('cbTotalMensuel').textContent = fmtGNF(totalMensuel);

        const list  = document.getElementById('cbList');
        const empty = document.getElementById('cbEmpty');
        if (cbs.length===0){ list.innerHTML=''; empty.style.display='block'; return; }
        empty.style.display='none';

        list.innerHTML = cbs.map(cb => {
            const prochaine = prochaineEcheance(cb);
            const joursRestants = prochaine ? Math.ceil((new Date(prochaine)-new Date(today()))/(1000*60*60*24)) : null;
            const echeanceClass = joursRestants!==null ? (joursRestants<0?'retard':joursRestants<=7?'proche':'ok') : '';
            const echeanceLabel = joursRestants!==null
                ? (joursRestants<0?`En retard de ${Math.abs(joursRestants)} j`
                  :joursRestants===0?'Échéance aujourd\'hui'
                  :`Dans ${joursRestants} jour${joursRestants>1?'s':''}`)
                : 'Soldé';
            const pct = cb.montantTotal>0 ? ((cb.montantTotal-cb.capitalRestant)/cb.montantTotal*100) : 100;
            const mensualitesPayees = cb.remboursements.filter(r=>!r.anticipé).length;
            const mensualitesTotales = cb.montantTotal>0&&cb.mensualite>0 ? Math.ceil(cb.montantTotal/cb.mensualite) : '?';

            return `<div class="cb-card ${cb.statut==='soldé'?'cb-solde':''}">
                <div class="cb-card-header">
                    <div class="cb-bank-icon">🏦</div>
                    <div class="cb-info">
                        <div class="cb-banque">${esc(cb.banque)}</div>
                        <div class="cb-meta">Depuis ${formatDate(cb.dateDebut)} · Mensualité: ${fmtGNF(cb.mensualite)}</div>
                    </div>
                    <div class="cb-statut-badge ${echeanceClass}">${echeanceLabel}</div>
                    <div class="cb-actions">
                        ${cb.statut==='actif'?`<button class="btn-ghost" onclick="App.openCBPaiementModal('${cb.id}')">Payer</button>`:''}
                        <button class="btn-icon delete" onclick="App.deleteCB('${cb.id}')">✕</button>
                    </div>
                </div>

                <div class="cb-progress-section">
                    <div class="cb-amounts">
                        <div><span class="cb-amount-label">Capital initial</span><span class="cb-amount-val">${fmtGNF(cb.montantTotal)}</span></div>
                        <div><span class="cb-amount-label">Restant dû</span><span class="cb-amount-val neg">${fmtGNF(cb.capitalRestant)}</span></div>
                        <div><span class="cb-amount-label">Mensualités</span><span class="cb-amount-val">${mensualitesPayees} / ${mensualitesTotales}</span></div>
                        <div><span class="cb-amount-label">Prochaine échéance</span><span class="cb-amount-val">${prochaine?formatDate(prochaine):'—'}</span></div>
                    </div>
                    <div class="credit-progress-track" style="margin-top:10px;">
                        <div class="credit-progress-fill" style="width:${pct.toFixed(1)}%"></div>
                    </div>
                    <div class="credit-progress-label">
                        <span>${fmtGNF(cb.montantTotal-cb.capitalRestant)} remboursé</span>
                        <span>${pct.toFixed(0)}%</span>
                    </div>
                </div>

                ${cb.remboursements.length>0?`
                <details class="client-history">
                    <summary>Historique paiements (${cb.remboursements.length})</summary>
                    <div class="client-history-table">
                        <table class="data-table">
                            <thead><tr><th>Date</th><th>Montant</th><th>Type</th><th>Capital restant</th><th>Note</th></tr></thead>
                            <tbody>
                            ${[...cb.remboursements].reverse().map(r=>`<tr>
                                <td class="mono muted">${formatDate(r.date)}</td>
                                <td class="mono pos">${fmtGNF(r.montant)}</td>
                                <td>${r.anticipé?'⚡ Anticipé':'📅 Mensualité'}</td>
                                <td class="mono">${fmtGNF(r.capitalApres)}</td>
                                <td class="muted">${r.note?esc(r.note):'—'}</td>
                            </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </details>`:``}
            </div>`;
        }).join('');
    }

    // Calcule la prochaine échéance non payée
    function prochaineEcheance(cb) {
        if (cb.statut==='soldé') return null;
        const debut = new Date(cb.dateDebut);
        const payees = cb.remboursements.filter(r=>!r.anticipé).length;
        const prochaine = new Date(debut);
        prochaine.setMonth(prochaine.getMonth() + payees + 1);
        return prochaine.toISOString().slice(0,10);
    }

    // Alertes échéances pour le dashboard
    function getCBAlerts() {
        const alerts = [];
        const t = today();
        (db.creditsBancaires||[]).filter(c=>c.statut==='actif').forEach(cb => {
            const prochaine = prochaineEcheance(cb);
            if (!prochaine) return;
            const jours = Math.ceil((new Date(prochaine)-new Date(t))/(1000*60*60*24));
            if (jours <= 7) alerts.push({ cb, prochaine, jours });
        });
        return alerts;
    }

    function openCBPaiementModal(id) {
        const cb = (db.creditsBancaires||[]).find(c=>c.id===id); if (!cb) return;
        document.getElementById('cbPayModalId').value = id;
        document.getElementById('cbPayModalBanque').textContent = cb.banque;
        document.getElementById('cbPayModalRestant').textContent = fmtGNF(cb.capitalRestant);
        document.getElementById('cbPayMontant').value = cb.mensualite;
        document.getElementById('cbPayDate').value = today();
        document.getElementById('cbPayNote').value = '';
        document.getElementById('cbPayAnticiped').checked = false;
        document.getElementById('cbPayModal').style.display = 'flex';
    }

    function closeCBPaiementModal() { document.getElementById('cbPayModal').style.display='none'; }

    function initCBModule() {
        // Formulaire création crédit bancaire
        document.getElementById('cbForm')?.addEventListener('submit', e=>{
            e.preventDefault();
            const banque   = document.getElementById('cbBanque').value.trim();
            const montantRaw = document.getElementById('cbMontant').value.trim();
            const montant  = calcEval(montantRaw)??parseFloat(montantRaw);
            const mensRaw  = document.getElementById('cbMensualite').value.trim();
            const mensualite = calcEval(mensRaw)??parseFloat(mensRaw);
            const dateDebut = document.getElementById('cbDateDebut').value;
            if (!banque||isNaN(montant)||montant<=0||isNaN(mensualite)||mensualite<=0||!dateDebut) return;
            const nbMois = Math.ceil(montant/mensualite);
            const dateFin = new Date(dateDebut);
            dateFin.setMonth(dateFin.getMonth()+nbMois);
            if (!db.creditsBancaires) db.creditsBancaires=[];
            db.creditsBancaires.push({
                id:uid(), banque, montantTotal:montant, mensualite, dateDebut,
                dateFin:dateFin.toISOString().slice(0,10),
                capitalRestant:montant, remboursements:[], statut:'actif'
            });
            saveDB(); e.target.reset(); renderCreditsBancaires();
            toast(`Crédit "${banque}" de ${fmtGNF(montant)} enregistré`,'success');
        });

        // Modal paiement
        document.getElementById('cbPayModal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeCBPaiementModal();});
        document.getElementById('cbPayForm')?.addEventListener('submit', e=>{
            e.preventDefault();
            const id = document.getElementById('cbPayModalId').value;
            const cb = (db.creditsBancaires||[]).find(c=>c.id===id); if (!cb) return;
            const date    = document.getElementById('cbPayDate').value;
            const montRaw = document.getElementById('cbPayMontant').value.trim();
            const montant = calcEval(montRaw)??parseFloat(montRaw);
            const note    = document.getElementById('cbPayNote').value.trim();
            const anticipé= document.getElementById('cbPayAnticiped').checked;
            const compte  = document.getElementById('cbPayCompte').value;
            if (!date||isNaN(montant)||montant<=0) return;

            cb.capitalRestant = Math.max(0, cb.capitalRestant - montant);
            const remb = {id:uid(),date,montant,anticipé,note,capitalApres:cb.capitalRestant};
            cb.remboursements.push(remb);
            if (cb.capitalRestant===0) cb.statut='soldé';

            // Sortie de caisse
            db.cashMovements.push({id:uid(),date,type:'out',accountId:compte,
                amount:montant,label:`Remb. crédit ${cb.banque}${anticipé?' (anticipé)':''}`});

            saveDB(); closeCBPaiementModal(); renderCreditsBancaires();
            // Mettre à jour alertes dashboard
            renderCBAlertsDashboard();
            toast(`Paiement de ${fmtGNF(montant)} enregistré${cb.statut==='soldé'?' — Crédit soldé ! 🎉':''}`,'success');
        });
    }

    function deleteCB(id) {
        const cb=(db.creditsBancaires||[]).find(c=>c.id===id);
        if (!cb||!confirm(`Supprimer le crédit "${cb.banque}" ?`)) return;
        db.creditsBancaires=db.creditsBancaires.filter(c=>c.id!==id);
        saveDB(); renderCreditsBancaires(); toast('Crédit supprimé','info');
    }

    function renderCBAlertsDashboard() {
        const alerts = getCBAlerts();
        const el = document.getElementById('cbAlertsBanner');
        if (!el) return;
        if (alerts.length===0) { el.style.display='none'; return; }
        el.style.display='block';
        el.innerHTML = alerts.map(a=>{
            const cls = a.jours<0?'alert-retard':a.jours<=3?'alert-urgent':'alert-proche';
            const label = a.jours<0?`Retard de ${Math.abs(a.jours)} j`
                :a.jours===0?'Aujourd\'hui':`Dans ${a.jours} j`;
            return `<div class="cb-alert-item ${cls}">
                <span class="cb-alert-icon">${a.jours<0?'⚠':'🔔'}</span>
                <span><strong>${esc(a.cb.banque)}</strong> — Mensualité ${fmtGNF(a.cb.mensualite)}</span>
                <span class="cb-alert-date">${label} · ${formatDate(a.prochaine)}</span>
            </div>`;
        }).join('');
    }

    // ─── Export / Import / Print ─────────────

    function exportData() {
        const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download=`komerce_export_${today()}.json`; a.click();
        URL.revokeObjectURL(url); toast('Données exportées ✓','success');
    }

    function importData() {
        document.getElementById('importFileInput').click();
    }

    function handleImport(e) {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = evt => {
            try {
                const imported = JSON.parse(evt.target.result);
                // Validation minimale
                if (!imported.products || !imported.inventories) {
                    toast('Fichier invalide — structure incorrecte','error'); return;
                }
                if (!confirm(`Importer ces données ? Cela remplacera toutes vos données actuelles.\n\n${imported.products.length} produits, ${Object.keys(imported.inventories).length} jours d'inventaire.`)) return;
                // Migration champs manquants
                if (!imported.accounts)      imported.accounts      = defaultDB().accounts;
                if (!imported.cashMovements) imported.cashMovements = [];
                if (!imported.cashClosings)  imported.cashClosings  = [];
                if (!imported.stockOuts)     imported.stockOuts     = [];
                if (!imported.expenses)      imported.expenses      = [];
                if (!imported.restocks)      imported.restocks      = [];
                db = imported;
                saveDB();
                switchTab('dashboard');
                toast(`Importation réussie ✓ — ${imported.products.length} produits chargés`,'success');
            } catch {
                toast('Erreur de lecture du fichier JSON','error');
            }
            // Reset input pour permettre re-import du même fichier
            e.target.value = '';
        };
        reader.readAsText(file);
    }

    // ─── Impression ──────────────────────────

    function openPrintModal() {
        document.getElementById('printStartDate').value = '';
        document.getElementById('printEndDate').value = '';
        document.getElementById('printModal').style.display = 'flex';
    }

    function closePrintModal() { document.getElementById('printModal').style.display = 'none'; }

    function doPrint() {
        const type = document.getElementById('printReportType').value;
        const startDate = document.getElementById('printStartDate').value;
        const endDate   = document.getElementById('printEndDate').value;
        const html = buildPrintHTML(type, startDate, endDate);
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); }, 400);
        closePrintModal();
    }

    function buildPrintHTML(type, startDate, endDate) {
        const dateRange = startDate && endDate
            ? `Période : ${formatDate(startDate)} → ${formatDate(endDate)}`
            : startDate ? `À partir du ${formatDate(startDate)}`
            : endDate   ? `Jusqu'au ${formatDate(endDate)}`
            : 'Toutes périodes';

        const titles = {
            dashboard:'Tableau de bord', sales:'Ventes détaillées', expenses:'Dépenses',
            profit:'Rapport bénéfices', inventory:'Historique inventaires', caisse:'Mouvements de caisse'
        };

        let bodyContent = '';

        if (type === 'dashboard') {
            const sales = computeSales();
            const totals = getTotals(sales);
            const expTotal = getTotalExpenses();
            const net = totals.margin - expTotal;
            const sv = getStockValues();
            const liquidity = getTotalLiquidity();
            bodyContent = `
                <div class="kpi-row">
                    <div class="kpi"><div class="kpi-label">Chiffre d'affaires</div><div class="kpi-val">${fmtGNF(totals.revenue)}</div></div>
                    <div class="kpi"><div class="kpi-label">Coût marchandises</div><div class="kpi-val">${fmtGNF(totals.cost)}</div></div>
                    <div class="kpi"><div class="kpi-label">Dépenses</div><div class="kpi-val">${fmtGNF(expTotal)}</div></div>
                    <div class="kpi highlight"><div class="kpi-label">Bénéfice net</div><div class="kpi-val">${fmtGNF(net)}</div></div>
                </div>
                <div class="kpi-row">
                    <div class="kpi"><div class="kpi-label">Stock (valeur vente)</div><div class="kpi-val">${fmtGNF(sv.sale)}</div></div>
                    <div class="kpi"><div class="kpi-label">Stock (valeur achat)</div><div class="kpi-val">${fmtGNF(sv.purchase)}</div></div>
                    <div class="kpi"><div class="kpi-label">Liquidités totales</div><div class="kpi-val">${fmtGNF(liquidity)}</div></div>
                    <div class="kpi"><div class="kpi-label">Marge nette</div><div class="kpi-val">${totals.revenue>0?((net/totals.revenue)*100).toFixed(1):0}%</div></div>
                </div>
                <h3>Soldes par compte</h3>
                <table><thead><tr><th>Compte</th><th>Solde</th></tr></thead><tbody>
                ${(db.accounts||[]).map(a=>`<tr><td>${a.icon} ${esc(a.name)}</td><td class="num">${fmtGNF(getAccountBalance(a.id))}</td></tr>`).join('')}
                </tbody></table>
                <h3>Performance produits</h3>
                <table><thead><tr><th>Produit</th><th>Qté vendue</th><th>CA</th><th>Marge</th></tr></thead><tbody>
                ${(() => {
                    const pr = {};
                    sales.forEach(s=>{ if(!pr[s.productId]) pr[s.productId]={name:s.productName,sold:0,revenue:0,margin:0};
                        pr[s.productId].sold+=s.sold; pr[s.productId].revenue+=s.revenue; pr[s.productId].margin+=s.margin; });
                    return Object.values(pr).sort((a,b)=>b.revenue-a.revenue).map(p=>
                        `<tr><td>${esc(p.name)}</td><td class="num">${p.sold}</td><td class="num">${fmtGNF(p.revenue)}</td><td class="num">${fmtGNF(p.margin)}</td></tr>`
                    ).join('');
                })()}
                </tbody></table>`;
        }

        else if (type === 'sales') {
            let rows = computeSales().filter(s=>s.sold>0||s.outsQty>0);
            if (startDate) rows=rows.filter(s=>s.date>=startDate);
            if (endDate)   rows=rows.filter(s=>s.date<=endDate);
            const totRev = rows.reduce((s,r)=>s+r.revenue,0);
            const totMarg = rows.reduce((s,r)=>s+r.margin,0);
            bodyContent = `
                <table><thead><tr><th>Date</th><th>Produit</th><th>Stock veille</th><th>Compté</th><th>Vendus</th><th>Sorties</th><th>CA</th><th>Marge</th></tr></thead>
                <tbody>
                ${[...rows].reverse().map(s=>`<tr>
                    <td>${formatDate(s.date)}</td><td>${esc(s.productName)}</td>
                    <td class="num">${s.prev}</td><td class="num">${s.counted}</td>
                    <td class="num">${s.sold}</td><td class="num">${s.outsQty>0?s.outsQty:'—'}</td>
                    <td class="num">${fmtGNF(s.revenue)}</td><td class="num">${fmtGNF(s.margin)}</td>
                </tr>`).join('')}
                </tbody>
                <tfoot><tr><td colspan="6"><strong>TOTAL</strong></td><td class="num"><strong>${fmtGNF(totRev)}</strong></td><td class="num"><strong>${fmtGNF(totMarg)}</strong></td></tr></tfoot>
                </table>`;
        }

        else if (type === 'expenses') {
            let rows = db.expenses||[];
            if (startDate) rows=rows.filter(e=>e.date>=startDate);
            if (endDate)   rows=rows.filter(e=>e.date<=endDate);
            const tot = rows.reduce((s,e)=>s+e.amount,0);
            const catLabelsLocal = {loyer:'Loyer',electricite:'Énergie',fournitures:'Fournitures',
                marketing:'Marketing',salaires:'Salaires',maintenance:'Maintenance',transport:'Transport',impots:'Impôts',autre:'Autre'};
            bodyContent = `
                <table><thead><tr><th>Date</th><th>Catégorie</th><th>Description</th><th>Montant</th><th>Récurrence</th></tr></thead>
                <tbody>
                ${[...rows].reverse().map(e=>`<tr>
                    <td>${formatDate(e.date)}</td><td>${catLabelsLocal[e.category]||e.category}</td>
                    <td>${esc(e.description)}</td><td class="num">${fmtGNF(e.amount)}</td>
                    <td>${e.recurring==='monthly'?'Mensuelle':e.recurring==='weekly'?'Hebdo':e.recurring==='daily'?'Quotidienne':'Unique'}</td>
                </tr>`).join('')}
                </tbody>
                <tfoot><tr><td colspan="3"><strong>TOTAL</strong></td><td class="num"><strong>${fmtGNF(tot)}</strong></td><td></td></tr></tfoot>
                </table>`;
        }

        else if (type === 'profit') {
            let sales = computeSales();
            if (startDate) sales=sales.filter(s=>s.date>=startDate);
            if (endDate)   sales=sales.filter(s=>s.date<=endDate);
            const totals = getTotals(sales);
            let exp = db.expenses||[];
            if (startDate) exp=exp.filter(e=>e.date>=startDate);
            if (endDate)   exp=exp.filter(e=>e.date<=endDate);
            const expTotal = exp.reduce((s,e)=>s+e.amount,0);
            const net = totals.margin - expTotal;
            bodyContent = `
                <div class="kpi-row">
                    <div class="kpi"><div class="kpi-label">Chiffre d'affaires</div><div class="kpi-val">${fmtGNF(totals.revenue)}</div></div>
                    <div class="kpi"><div class="kpi-label">− Coût marchandises</div><div class="kpi-val">${fmtGNF(totals.cost)}</div></div>
                    <div class="kpi"><div class="kpi-label">− Dépenses</div><div class="kpi-val">${fmtGNF(expTotal)}</div></div>
                    <div class="kpi highlight"><div class="kpi-label">= Bénéfice net</div><div class="kpi-val">${fmtGNF(net)}</div></div>
                </div>
                <p style="margin:8px 0;font-size:13px;">Marge nette : <strong>${totals.revenue>0?((net/totals.revenue)*100).toFixed(1):0}%</strong></p>
                <h3>Détail par produit</h3>
                <table><thead><tr><th>Produit</th><th>Qté vendue</th><th>CA</th><th>Coût</th><th>Marge</th></tr></thead><tbody>
                ${(() => {
                    const pr={};
                    sales.forEach(s=>{ if(!pr[s.productId]) pr[s.productId]={name:s.productName,sold:0,revenue:0,cost:0,margin:0};
                        pr[s.productId].sold+=s.sold; pr[s.productId].revenue+=s.revenue;
                        pr[s.productId].cost+=s.cost; pr[s.productId].margin+=s.margin; });
                    return Object.values(pr).sort((a,b)=>b.margin-a.margin).map(p=>
                        `<tr><td>${esc(p.name)}</td><td class="num">${p.sold}</td><td class="num">${fmtGNF(p.revenue)}</td><td class="num">${fmtGNF(p.cost)}</td><td class="num">${fmtGNF(p.margin)}</td></tr>`
                    ).join('');
                })()}
                </tbody></table>`;
        }

        else if (type === 'inventory') {
            let rows = computeSales();
            if (startDate) rows=rows.filter(s=>s.date>=startDate);
            if (endDate)   rows=rows.filter(s=>s.date<=endDate);
            bodyContent = `
                <table><thead><tr><th>Date</th><th>Produit</th><th>Stock compté</th><th>Sorties</th><th>Vendus</th><th>CA</th></tr></thead>
                <tbody>
                ${[...rows].reverse().map(s=>`<tr>
                    <td>${formatDate(s.date)}</td><td>${esc(s.productName)}</td>
                    <td class="num">${s.counted}</td><td class="num">${s.outsQty>0?s.outsQty:'—'}</td>
                    <td class="num">${s.sold}</td><td class="num">${s.sold>0?fmtGNF(s.revenue):'—'}</td>
                </tr>`).join('')}
                </tbody></table>`;
        }

        else if (type === 'caisse') {
            let mvts = db.cashMovements||[];
            if (startDate) mvts=mvts.filter(m=>m.date>=startDate);
            if (endDate)   mvts=mvts.filter(m=>m.date<=endDate);
            const accMap={}; (db.accounts||[]).forEach(a=>{accMap[a.id]=a;});
            bodyContent = `
                <h3>Soldes actuels</h3>
                <table><thead><tr><th>Compte</th><th>Solde</th></tr></thead><tbody>
                ${(db.accounts||[]).map(a=>`<tr><td>${a.icon} ${esc(a.name)}</td><td class="num">${fmtGNF(getAccountBalance(a.id))}</td></tr>`).join('')}
                <tr><td><strong>TOTAL LIQUIDITÉS</strong></td><td class="num"><strong>${fmtGNF(getTotalLiquidity())}</strong></td></tr>
                </tbody></table>
                <h3>Mouvements</h3>
                <table><thead><tr><th>Date</th><th>Type</th><th>Compte</th><th>Libellé</th><th>Montant</th></tr></thead>
                <tbody>
                ${[...mvts].reverse().map(m=>{
                    const acc=accMap[m.accountId];
                    const typeLabel=m.type==='in'?'Entrée':m.type==='out'?'Sortie':'Virement';
                    const sign=m.type==='in'?'+':m.type==='out'?'−':'';
                    return `<tr><td>${formatDate(m.date)}</td><td>${typeLabel}</td><td>${acc?acc.icon+' '+esc(acc.name):'—'}</td><td>${esc(m.label)}</td><td class="num">${sign}${fmtGNF(m.amount)}</td></tr>`;
                }).join('')}
                </tbody></table>`;
        }

        return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Komerce — ${titles[type]}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; padding: 24px; }
    .print-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #c8955a; padding-bottom: 12px; margin-bottom: 20px; }
    .print-brand { font-size: 22px; font-weight: 700; color: #c8955a; letter-spacing: -0.5px; }
    .print-meta { text-align: right; color: #666; font-size: 11px; }
    .print-title { font-size: 16px; font-weight: 600; color: #1a1a1a; margin-bottom: 2px; }
    .kpi-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .kpi { flex: 1; min-width: 140px; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px 14px; }
    .kpi.highlight { border-color: #c8955a; background: #fdf6ee; }
    .kpi-label { font-size: 10px; text-transform: uppercase; color: #888; margin-bottom: 4px; letter-spacing: 0.05em; }
    .kpi-val { font-size: 15px; font-weight: 700; color: #1a1a1a; }
    h3 { font-size: 13px; font-weight: 600; margin: 18px 0 8px; color: #444; text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
    th { background: #f5f5f5; padding: 7px 10px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; color: #555; border-bottom: 2px solid #ddd; }
    td { padding: 6px 10px; border-bottom: 1px solid #eee; }
    tr:last-child td { border-bottom: none; }
    tfoot td { border-top: 2px solid #ddd; background: #fafafa; }
    .num { text-align: right; font-family: monospace; }
    .print-footer { margin-top: 24px; border-top: 1px solid #ddd; padding-top: 10px; font-size: 10px; color: #aaa; text-align: center; }
    @media print {
        body { padding: 12px; }
        @page { margin: 1.5cm; }
    }
</style>
</head>
<body>
<div class="print-header">
    <div>
        <div class="print-brand">Komerce</div>
        <div class="print-title">${titles[type]}</div>
    </div>
    <div class="print-meta">
        <div>${dateRange}</div>
        <div>Imprimé le ${formatDate(today())}</div>
    </div>
</div>
${bodyContent}
<div class="print-footer">Généré par Komerce — Gestion commerciale</div>
</body>
</html>`;
    }

    function resetAll() {
        if (!confirm('⚠️ Tout réinitialiser ? Cette action est irréversible.')) return;
        if (!confirm('Dernière confirmation : toutes les données seront supprimées.')) return;
        localStorage.removeItem(DB_KEY); db=defaultDB(); switchTab('dashboard');
        toast('Données réinitialisées','info');
    }

    // ─── Thème ───────────────────────────────

    function initTheme() {
        const saved = localStorage.getItem('komerce_theme') || 'dark';
        applyTheme(saved);
        document.getElementById('themeToggleBtn').addEventListener('click', () => {
            const current = document.documentElement.dataset.theme || 'dark';
            applyTheme(current === 'dark' ? 'light' : 'dark');
        });
    }

    function applyTheme(theme) {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem('komerce_theme', theme);
        const icon  = document.getElementById('themeIcon');
        const label = document.getElementById('themeLabel');
        if (theme === 'light') {
            icon.textContent  = '☾';
            label.textContent = 'Thème sombre';
        } else {
            icon.textContent  = '☀';
            label.textContent = 'Thème clair';
        }
    }

    // ═══════════════════════════════════════════
    //   GESTION BOUTIQUES
    // ═══════════════════════════════════════════

    const SHOP_COLORS = ['#c8955a','#6db87a','#7ab4d4','#a88fd4','#d4736a','#d4c874','#74d4c8','#d474b4'];

    function showShopScreen() {
        document.getElementById('appShell').style.display = 'none';
        document.getElementById('shopScreen').style.display = 'flex';
        renderShopScreen();
    }

    function hideShopScreen() {
        document.getElementById('shopScreen').style.display = 'none';
        document.getElementById('appShell').style.display   = 'flex';
    }

    function renderShopScreen() {
        const shops = getShops();
        const list  = document.getElementById('shopList');
        if (shops.length === 0) {
            list.innerHTML = '<p class="shop-empty">Aucune boutique. Créez-en une pour commencer.</p>';
            return;
        }
        list.innerHTML = shops.map(s => `
            <div class="shop-card" onclick="App.selectShop('${s.id}')">
                <div class="shop-card-dot" style="background:${s.color}"></div>
                <div class="shop-card-info">
                    <div class="shop-card-name">${esc(s.name)}</div>
                    <div class="shop-card-date">Créée le ${formatDate(s.createdAt.slice(0,10))}</div>
                </div>
                <div class="shop-card-actions" onclick="event.stopPropagation()">
                    <button class="btn-icon" onclick="App.renameShop('${s.id}')" title="Renommer">✎</button>
                    <button class="btn-icon delete" onclick="App.deleteShop('${s.id}')" title="Supprimer">✕</button>
                </div>
            </div>`).join('');
    }

    function selectShop(id) {
        setActiveShopId(id);
        if (!loadCurrentShop()) return;
        hideShopScreen();
        updateShopBadge();
        switchTab('dashboard');
        toast(`Boutique "${getCurrentShop()?.name}" chargée`, 'success');
    }

    function updateShopBadge() {
        const shop = getCurrentShop();
        const badge = document.getElementById('shopBadge');
        const name  = document.getElementById('shopBadgeName');
        if (!badge || !name) return;
        if (shop) {
            name.textContent = shop.name;
            badge.style.borderLeftColor = shop.color;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    function createShop() {
        const nameEl  = document.getElementById('newShopName');
        const colorEl = document.getElementById('newShopColor');
        const name = nameEl.value.trim();
        if (!name) { toast('Entrez un nom de boutique', 'error'); return; }
        const shops = getShops();
        const color = colorEl.value || SHOP_COLORS[shops.length % SHOP_COLORS.length];
        const id = uid();
        shops.push({ id, name, color, createdAt: new Date().toISOString() });
        saveShops(shops);
        saveShopDB(id, defaultDB());
        nameEl.value = '';
        selectShop(id);
    }

    function renameShop(id) {
        const shops = getShops();
        const shop  = shops.find(s => s.id === id);
        if (!shop) return;
        const newName = prompt('Nouveau nom :', shop.name);
        if (!newName?.trim()) return;
        shop.name = newName.trim();
        saveShops(shops);
        if (id === currentShopId) updateShopBadge();
        renderShopScreen();
        toast('Boutique renommée', 'success');
    }

    function deleteShop(id) {
        const shops = getShops();
        const shop  = shops.find(s => s.id === id);
        if (!shop) return;
        if (!confirm(`Supprimer la boutique "${shop.name}" et toutes ses données ?`)) return;
        saveShops(shops.filter(s => s.id !== id));
        localStorage.removeItem(shopKey(id));
        if (id === currentShopId) {
            currentShopId = null; db = null;
            localStorage.removeItem(ACTIVE_KEY);
            showShopScreen();
        } else { renderShopScreen(); }
        toast('Boutique supprimée', 'info');
    }

    // ─── Tableau de bord global ───────────────

    function renderGlobalDashboard() {
        const shops = getShops();
        const container = document.getElementById('globalDashContent');
        if (!container) return;

        if (shops.length === 0) {
            container.innerHTML = '<p class="empty-mini">Aucune boutique créée.</p>';
            return;
        }

        let totalRevenue = 0, totalNet = 0, totalLiq = 0;

        const rows = shops.map(s => {
            const data = loadShopDB(s.id);
            // Calcul CA et bénéfices pour cette boutique
            const sales = computeSalesForDB(data);
            const totals = getTotals(sales);
            const expTotal = (data.expenses||[]).reduce((a,e)=>a+e.amount,0);
            const net = totals.margin - expTotal;
            const liq = (data.accounts||[]).reduce((sum, a) => {
                return sum + (data.cashMovements||[]).reduce((bal, m) => {
                    if (m.type==='in'       && m.accountId===a.id) return bal+m.amount;
                    if (m.type==='out'      && m.accountId===a.id) return bal-m.amount;
                    if (m.type==='transfer' && m.accountId===a.id) return bal-m.amount;
                    if (m.type==='transfer' && m.toAccountId===a.id) return bal+m.amount;
                    return bal;
                }, 0);
            }, 0);
            totalRevenue += totals.revenue;
            totalNet     += net;
            totalLiq     += liq;
            return { shop: s, revenue: totals.revenue, net, liq };
        });

        document.getElementById('globalTotalRevenue').textContent = fmtGNF(totalRevenue);
        document.getElementById('globalTotalNet').textContent     = fmtGNF(totalNet);
        document.getElementById('globalTotalNet').style.color     = totalNet>=0?'var(--green)':'var(--red)';
        document.getElementById('globalTotalLiq').textContent     = fmtGNF(totalLiq);

        container.innerHTML = rows.map(r => `
            <div class="global-shop-row" onclick="App.selectShop('${r.shop.id}')">
                <div class="global-shop-dot" style="background:${r.shop.color}"></div>
                <div class="global-shop-name">${esc(r.shop.name)}</div>
                <div class="global-shop-stats">
                    <span class="global-stat"><span class="global-stat-label">CA</span> ${fmtGNF(r.revenue)}</span>
                    <span class="global-stat"><span class="global-stat-label">Bénéfice</span>
                        <span style="color:${r.net>=0?'var(--green)':'var(--red)'}">${fmtGNF(r.net)}</span></span>
                    <span class="global-stat"><span class="global-stat-label">Liquidités</span> ${fmtGNF(r.liq)}</span>
                </div>
                <div class="global-shop-arrow">→</div>
            </div>`).join('');
    }

    // computeSales adapté pour une DB arbitraire
    function computeSalesForDB(data) {
        const sales = [];
        Object.keys(data.inventories||{}).sort().forEach(date => {
            const inv = data.inventories[date];
            (data.products||[]).forEach(p => {
                if (inv[p.id]===undefined) return;
                // stock précédent simplifié
                const dates = Object.keys(data.inventories).filter(d=>d<date).sort();
                let prev = p.initialStock||0;
                for (let i=dates.length-1;i>=0;i--) {
                    const li=dates[i], linv=data.inventories[li];
                    if (linv&&linv[p.id]!==undefined) {
                        prev=linv[p.id];
                        (data.restocks||[]).filter(r=>r.productId===p.id&&r.date>li&&r.date<date).forEach(r=>{prev+=r.quantity;});
                        break;
                    }
                }
                const outsQty=(data.stockOuts||[]).filter(o=>o.date===date&&o.productId===p.id).reduce((s,o)=>s+o.qty,0);
                const sold=Math.max(0,prev-inv[p.id]-outsQty);
                sales.push({revenue:sold*p.salePrice,cost:sold*(p.purchaseCost||0),margin:sold*(p.salePrice-(p.purchaseCost||0))});
            });
        });
        return sales;
    }

    // ─── Reset (scope boutique courante) ─────

    function resetAll() {
        const shop = getCurrentShop();
        if (!confirm(`⚠️ Réinitialiser toutes les données de "${shop?.name}" ?`)) return;
        if (!confirm('Dernière confirmation : données de cette boutique supprimées.')) return;
        db = defaultDB();
        saveDB();
        switchTab('dashboard');
        toast('Données réinitialisées', 'info');
    }

    // ─── Init ────────────────────────────────

    function init() {
        migrateV3Legacy();
        initTheme();

        // Bouton "Changer de boutique" dans sidebar
        document.getElementById('switchShopBtn')?.addEventListener('click', showShopScreen);

        // Écran boutiques
        document.getElementById('createShopBtn')?.addEventListener('click', createShop);
        document.getElementById('newShopName')?.addEventListener('keydown', e => {
            if (e.key==='Enter') createShop();
        });

        // Tab global dashboard
        document.querySelectorAll('[data-tab="global"]').forEach(el => {
            el.addEventListener('click', e => {
                e.preventDefault();
                showGlobalDashboard();
                closeSidebar();
            });
        });

        if (!loadCurrentShop()) {
            showShopScreen();
            return;
        }

        hideShopScreen();
        updateShopBadge();
        initApp();
    }

    function initApp() {
        initNav(); initMobile();
        initProductForm(); initRestockForm(); initEditForm();
        initInventoryForm(); initExpenseForm(); initProfitCalculator();
        initSalesSearch(); initHistorySearch();
        initMovementModal(); initTransferForm();
        initGerantForm(); initClientForm(); initCreditModal(); initRembModal();
        initCBModule();
        document.getElementById('exportDataBtn').addEventListener('click',exportData);
        document.getElementById('importDataBtn').addEventListener('click',importData);
        document.getElementById('importFileInput').addEventListener('change',handleImport);
        document.getElementById('printBtn').addEventListener('click',openPrintModal);
        document.getElementById('printModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closePrintModal(); });
        document.getElementById('resetAllBtn').addEventListener('click',resetAll);
        document.getElementById('validateClosingBtn').addEventListener('click',validateClosing);
        document.getElementById('movementsSearch')?.addEventListener('input',renderMovementsTable);
        initCalcObserver();
        renderDashboard();
    }

    function showGlobalDashboard() {
        document.querySelectorAll('.tab-content').forEach(s=>s.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
        document.getElementById('globalDash')?.classList.add('active');
        document.querySelectorAll('[data-tab="global"]').forEach(el=>el.classList.add('active'));
        renderGlobalDashboard();
    }

    document.addEventListener('DOMContentLoaded', init);

    return {
        switchTab, goToInventory,
        openEditModal, closeEditModal, deleteProduct,
        deleteExpense, deleteMovement,
        openMovementModal, closeMovementModal,
        closePrintModal, doPrint,
        validateClosing, closePerteModal, handlePerte,
        exportData, resetAll,
        selectShop, renameShop, deleteShop, createShop, showShopScreen,
        deleteGerant, deleteClient,
        openCreditModal, closeCreditModal,
        openRembModal, closeRembModal,
        switchGCTab,
        openCBPaiementModal, closeCBPaiementModal, deleteCB
    };
})();



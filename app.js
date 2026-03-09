/**
 * app.js - CryptoManager Core Logic
 * Handles state management, Binance API fetching, DOM updates, multi-entry logic, and staggering stops.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const firebaseConfig = {
  // ATENÇÃO: Substitua os placeholders abaixo pelas configurações reais do seu projeto Firebase
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_AUTH_DOMAIN",
  projectId: "SEU_PROJECT_ID",
  storageBucket: "SEU_STORAGE_BUCKET",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const PORTFOLIO_DOC_ID = 'meuPortfolio';

// ======== State Management ========
// Each transaction: { id: string, symbol: string, quantity: number, buyPriceBRL: number, date: string }
let transactions = [];
// Expand tracking
let expandedRows = {};

let currentPrices = {}; 
let isFetching = false;
let isDataLoaded = false;

// ======== Binance API Integration ========
const fetchMarketPrices = async () => {
    if(isFetching) return;
    isFetching = true;
    
    const btnRefresh = document.getElementById('refreshPrices');
    btnRefresh.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> Atualizando...';
    lucide.createIcons();
    
    try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/price');
        const data = await response.json();
        
        data.forEach(item => {
            if(item.symbol.endsWith('BRL') || item.symbol.endsWith('USDT')) {
                currentPrices[item.symbol] = parseFloat(item.price);
            }
        });
        
        const usdPriceItem = data.find(i => i.symbol === 'USDTBRL');
        if (usdPriceItem) {
            currentPrices['USDBRL'] = parseFloat(usdPriceItem.price);
        }

        document.getElementById('lastUpdateText').textContent = new Date().toLocaleTimeString('pt-BR');
        
        updateDashboard();
        renderTable();
    } catch (error) {
        console.error("Error fetching Binance API:", error);
        // Silent fail on interval so we don't spam alerts.
    } finally {
        isFetching = false;
        btnRefresh.innerHTML = '<i data-lucide="refresh-cw"></i> Atualizar';
        lucide.createIcons();
    }
};

// Start initial fetch
fetchMarketPrices();
// Fetch every 10 minutes (600,000 ms) as requested
setInterval(fetchMarketPrices, 600000);

// ======== Helper Functions ========
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatNumber = (value, decimals = 4) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: decimals }).format(value);
const formatDate = (dateString) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(dateString));

const getCoinPrice = (symbol) => {
    const s = symbol.toUpperCase();
    if (currentPrices[`${s}BRL`]) return currentPrices[`${s}BRL`];
    if (currentPrices[`${s}USDT`] && currentPrices['USDBRL']) {
        return currentPrices[`${s}USDT`] * currentPrices['USDBRL'];
    }
    return 0; // Price not found
};

const generateId = () => '_' + Math.random().toString(36).substr(2, 9);
const parseBrFloat = (str) => {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    let s = str.toString().trim();
    if (s.includes('.') && s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    return parseFloat(s) || 0;
};

// ======== Core Logic ========

// Auto-calculation logic for form
document.getElementById('coinPriceBuy').addEventListener('input', () => {
    const p = parseBrFloat(document.getElementById('coinPriceBuy').value);
    const i = parseBrFloat(document.getElementById('totalInvestedInput').value);
    if(p > 0 && i > 0) {
        document.getElementById('coinQuantity').value = (i / p).toFixed(8).replace('.', ',');
    }
});
document.getElementById('totalInvestedInput').addEventListener('input', () => {
    const p = parseBrFloat(document.getElementById('coinPriceBuy').value);
    const i = parseBrFloat(document.getElementById('totalInvestedInput').value);
    if(p > 0 && i > 0) {
        document.getElementById('coinQuantity').value = (i / p).toFixed(8).replace('.', ',');
    }
});

// Form Submit
document.getElementById('addTransactionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    let symbol = document.getElementById('coinSymbol').value.toUpperCase().trim();
    if(symbol.endsWith('BRL')) symbol = symbol.replace('BRL', '');
    if(symbol.endsWith('USDT')) symbol = symbol.replace('USDT', '');
    
    const quantity = parseBrFloat(document.getElementById('coinQuantity').value);
    const buyPriceBRL = parseBrFloat(document.getElementById('coinPriceBuy').value);
    const investedVal = parseBrFloat(document.getElementById('totalInvestedInput').value);
    
    const newTx = {
        id: generateId(),
        symbol,
        quantity,
        buyPriceBRL,
        invested: isNaN(investedVal) ? (quantity * buyPriceBRL) : investedVal,
        date: new Date().toISOString()
    };
    
    transactions.push(newTx);
    saveData();
    e.target.reset();
    fetchMarketPrices(); 
});

window.removeTransaction = (id) => {
    if(confirm('Tem certeza que deseja apagar este depósito específico?')) {
        transactions = transactions.filter(t => t.id !== id);
        saveData();
    }
};

window.removeSingleAsset = (symbol) => {
    if(confirm(`Tem certeza que deseja apagar TODOS os registros de ${symbol}?`)) {
        transactions = transactions.filter(t => t.symbol !== symbol);
        delete expandedRows[symbol];
        saveData();
    }
};

const saveData = async () => {
    try {
        const docRef = doc(db, "portfolios", PORTFOLIO_DOC_ID);
        await setDoc(docRef, { transactions, expandedRows }, { merge: true });
    } catch (error) {
        console.error("Erro ao salvar no Firebase:", error);
    }
    
    // Backup local
    localStorage.setItem('cryptoTransactions', JSON.stringify(transactions));
    localStorage.setItem('cryptoExpandedRows', JSON.stringify(expandedRows));
    
    updateDashboard();
    renderTable();
};

const loadDataFromFirebase = async () => {
    try {
        const docRef = doc(db, "portfolios", PORTFOLIO_DOC_ID);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            transactions = data.transactions || [];
            expandedRows = data.expandedRows || {};
        } else {
            transactions = [];
            expandedRows = {};
            await setDoc(docRef, { transactions, expandedRows });
        }
    } catch (error) {
        console.error("Erro ao carregar do Firebase:", error);
        transactions = JSON.parse(localStorage.getItem('cryptoTransactions')) || [];
        expandedRows = JSON.parse(localStorage.getItem('cryptoExpandedRows')) || {};
    } finally {
        isDataLoaded = true;
        updateDashboard();
        renderTable();
    }
};

window.toggleRow = (symbol) => {
    expandedRows[symbol] = !expandedRows[symbol];
    saveData();
};

// Groups transactions and calculated child deposits
const getAggregatedPortfolio = () => {
    const portfolioMap = {};
    
    // Sort transactions oldest first
    const sortedTxs = [...transactions].sort((a,b) => new Date(a.date) - new Date(b.date));
    
    sortedTxs.forEach(tx => {
        if(!portfolioMap[tx.symbol]) {
            portfolioMap[tx.symbol] = {
                symbol: tx.symbol,
                totalQuantity: 0,
                totalInvested: 0,
                deposits: []
            };
        }
        
        let actualInvested;
        let actualUnitPrice = tx.buyPriceBRL; // Sempre exatamente o que foi salvo
        
        // Se a propriedade tx.invested existe, significa que foi gerado com a versão nova do sistema
        if (tx.invested !== undefined && tx.invested !== null && !isNaN(tx.invested)) {
            actualInvested = tx.invested;
        } else {
            // Se for registro antigo, o investido era (quantidade * preço da unidade)
            actualInvested = tx.quantity * tx.buyPriceBRL;
        }

        const currentPrice = getCoinPrice(tx.symbol);
        const txCurrentValue = tx.quantity * (currentPrice || actualUnitPrice);
        const txProfitLoss = txCurrentValue - actualInvested;
        const txProfitPercent = actualInvested > 0 ? (txProfitLoss / actualInvested) * 100 : 0;
        
        const depositData = {
            ...tx,
            buyPriceBRL: actualUnitPrice,
            txInvested: actualInvested,
            txCurrentValue,
            txProfitLoss,
            txProfitPercent
        };
        
        portfolioMap[tx.symbol].deposits.push(depositData);
        portfolioMap[tx.symbol].totalQuantity += tx.quantity;
        portfolioMap[tx.symbol].totalInvested += actualInvested;
    });
    
    return Object.values(portfolioMap).map(p => {
        const averageBuyPrice = p.totalInvested / p.totalQuantity;
        const currentPrice = getCoinPrice(p.symbol);
        const currentValue = p.totalQuantity * (currentPrice || averageBuyPrice);
        const profitLoss = currentValue - p.totalInvested;
        const profitLossPercent = p.totalInvested > 0 ? (profitLoss / p.totalInvested) * 100 : 0;
        
        return {
            ...p,
            averageBuyPrice,
            currentPrice,
            currentValue,
            profitLoss,
            profitLossPercent
        };
    });
};

// Dashboard
const updateDashboard = () => {
    if (!isDataLoaded) return;
    const portfolio = getAggregatedPortfolio();
    
    let overAllInvested = 0;
    let overAllCurrentValue = 0;
    
    portfolio.forEach(p => {
        overAllInvested += p.totalInvested;
        overAllCurrentValue += p.currentValue;
    });
    
    const overAllProfit = overAllCurrentValue - overAllInvested;
    const overAllProfitPercent = overAllInvested > 0 ? (overAllProfit / overAllInvested) * 100 : 0;
    
    document.getElementById('totalInvested').innerText = formatCurrency(overAllInvested);
    document.getElementById('currentBalance').innerText = formatCurrency(overAllCurrentValue);
    
    const profitEl = document.getElementById('totalProfit');
    const profitBadge = document.getElementById('profitBadge');
    const profitIconWrapper = document.getElementById('profitIconWrapper');
    const profitIcon = document.getElementById('profitIcon');
    
    profitEl.innerText = formatCurrency(overAllProfit);
    profitBadge.innerText = `${overAllProfitPercent > 0 ? '+' : ''}${overAllProfitPercent.toFixed(2)}%`;
    
    if (overAllProfit >= 0) {
        profitEl.className = 'text-positive';
        profitBadge.className = 'badge positive';
        profitIconWrapper.className = 'icon-wrapper positive-bg text-positive';
        profitIcon.setAttribute('data-lucide', 'trending-up');
    } else {
        profitEl.className = 'text-negative';
        profitBadge.className = 'badge negative';
        profitIconWrapper.className = 'icon-wrapper negative-bg text-negative';
        profitIcon.setAttribute('data-lucide', 'trending-down');
    }
    
    lucide.createIcons();
};

// Generates the Stop Gain Badges HTML based on profit percent
const getStopGainBadges = (percent) => {
    if (percent < 10) {
        return `<span class="stop-badge stop-inactive">10%</span>
                <span class="stop-badge stop-inactive">25%</span>
                <span class="stop-badge stop-inactive">30%+</span>`;
    }
    
    let str = `<span class="stop-badge stop-10">10%</span> `;
    
    if (percent >= 25 && percent < 30) {
        str += `<span class="stop-badge stop-25">25%</span> <span class="stop-badge stop-inactive">30%+</span>`;
    } else if (percent >= 30) {
        str += `<span class="stop-badge stop-25">25%</span> <span class="stop-badge stop-30">30%+</span>`;
    } else {
        str += `<span class="stop-badge stop-inactive">25%</span> <span class="stop-badge stop-inactive">30%+</span>`;
    }
    return str;
};

// Rendering Table
const renderTable = () => {
    if (!isDataLoaded) return;
    const tbody = document.getElementById('portfolioTableBody');
    const emptyState = document.getElementById('emptyState');
    const portfolio = getAggregatedPortfolio();
    
    tbody.innerHTML = '';
    
    if (portfolio.length === 0) {
        emptyState.classList.remove('hide');
        return;
    }
    
    emptyState.classList.add('hide');
    
    portfolio.forEach(p => {
        // Parent Row
        const isExpanded = !!expandedRows[p.symbol];
        const chevronIcon = isExpanded ? 'chevron-up' : 'chevron-down';
        
        const pPlColorClass = p.profitLoss >= 0 ? 'text-positive' : 'text-negative';
        const pPlSymbol = p.profitLoss > 0 ? '+' : '';
        
        const parentTr = document.createElement('tr');
        parentTr.className = 'parent-row';
        parentTr.innerHTML = `
            <td>
                <button class="btn-icon-small" onclick="toggleRow('${p.symbol}')" title="Ver depósitos">
                    <i data-lucide="${chevronIcon}"></i>
                </button>
            </td>
            <td>
                <div class="coin-cell">
                    <div class="coin-icon">${p.symbol.charAt(0)}</div>
                    ${p.symbol}
                </div>
            </td>
            <td><strong>${formatNumber(p.totalQuantity, 6)}</strong></td>
            <td>
                <small class="text-muted">Último Unid:</small><br>
                ${formatCurrency(p.deposits[p.deposits.length - 1].buyPriceBRL)}
            </td>
            <td><strong style="color: var(--primary); font-size: 1.05rem;">${p.currentPrice ? formatCurrency(p.currentPrice) : '<span class="text-muted">--</span>'}</strong></td>
            <td class="hide-mobile text-positive">
                <small title="Preço médio alvo para +10%">${formatCurrency(p.averageBuyPrice * 1.10)}</small>
            </td>
            <td class="hide-mobile" style="color: var(--stop-25);">
                <small title="Preço médio alvo para +25%">${formatCurrency(p.averageBuyPrice * 1.25)}</small>
            </td>
            <td class="hide-mobile"><strong>${formatCurrency(p.totalInvested)}</strong></td>
            <td><strong>${formatCurrency(p.currentValue)}</strong></td>
            <td class="${pPlColorClass}">
                <strong>${formatCurrency(p.profitLoss)}</strong><br>
                <small>${pPlSymbol}${p.profitLossPercent.toFixed(2)}%</small>
            </td>
            <td></td>
            <td>
                <button class="btn-danger" title="Apagar Ativo (Todos)" onclick="removeSingleAsset('${p.symbol}')">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;
        tbody.appendChild(parentTr);
        
        // Children Rows (Deposits)
        p.deposits.forEach((dep, index) => {
            const childTr = document.createElement('tr');
            childTr.className = `child-row ${isExpanded ? 'open' : ''}`;
            
            const depPlColorClass = dep.txProfitLoss >= 0 ? 'text-positive' : 'text-negative';
            const depPlSymbol = dep.txProfitLoss > 0 ? '+' : '';
            
            let signalText10 = '';
            let signalText25 = '';
            if (dep.txProfitPercent >= 10) {
                signalText10 = `<div class="pulse-alert target-10" style="margin-top: 5px;"><i data-lucide="alert-circle"></i> Vender!</div>`;
            }
            if (dep.txProfitPercent >= 25) {
                signalText25 = `<div class="pulse-alert target-25" style="margin-top: 5px;"><i data-lucide="alert-triangle"></i> Vender!</div>`;
            }

            childTr.innerHTML = `
                <td></td>
                <td>
                    <small class="text-muted">Depósito #${index+1}</small><br>
                    <small class="text-muted" style="font-size: 0.75rem">${formatDate(dep.date)}</small>
                </td>
                <td>
                    ${formatNumber(dep.quantity, 8)}
                </td>
                <td>
                    <small class="text-muted" style="font-size: 0.75rem"></small> ${formatCurrency(dep.buyPriceBRL)}<br>
                    <small class="text-muted" style="font-size: 0.75rem">Pago:</small> ${formatCurrency(dep.txInvested)}
                </td>
                <td>
                    <div class="stop-badges">
                        ${getStopGainBadges(dep.txProfitPercent)}
                    </div>
                </td>
                <td class="hide-mobile text-positive">
                    <strong title="Preço de venda sugerido para atingir 10%">${formatCurrency(dep.buyPriceBRL * 1.10)}</strong><br>
                    ${signalText10}
                </td>
                <td class="hide-mobile " style="color: var(--stop-25);">
                    <strong title="Preço de venda sugerido para atingir 25%">${formatCurrency(dep.buyPriceBRL * 1.25)}</strong><br>
                    ${signalText25}
                </td>
                <td class="hide-mobile">${formatCurrency(dep.txInvested)}</td>
                <td>${formatCurrency(dep.txCurrentValue)}</td>
                <td class="${depPlColorClass}">
                    ${formatCurrency(dep.txProfitLoss)}<br>
                    <small>${depPlSymbol}${dep.txProfitPercent.toFixed(2)}%</small>
                </td>
                <td>
                    <button class="btn-recommend" onclick="openRecommendation('${dep.id}')" title="Estratégia para este depósito">
                        <i data-lucide="target" style="width:14px; height:14px;"></i> Target
                    </button>
                </td>
                <td>
                    <button class="btn-danger" style="padding: 0.2rem" title="Apagar este depósito" onclick="removeTransaction('${dep.id}')">
                        <i data-lucide="x" style="width:16px; height:16px;"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(childTr);
        });
    });
    
    lucide.createIcons();
};

// ======== Recommendation Modal ========
const modal = document.getElementById('recommendationModal');

window.openRecommendation = (depositId) => {
    const portfolio = getAggregatedPortfolio();
    let targetDep = null;
    let targetSymbol = '';
    
    for (let p of portfolio) {
        for (let d of p.deposits) {
            if (d.id === depositId) {
                targetDep = d;
                targetSymbol = p.symbol;
                break;
            }
        }
    }
    
    if (!targetDep) return;
    
    const currentPrice = getCoinPrice(targetSymbol);
    const txInvested = targetDep.txInvested;
    const txCurrentValue = targetDep.txCurrentValue;
    const txProfitLoss = targetDep.txProfitLoss;
    const txProfitPercent = targetDep.txProfitPercent;
    
    document.getElementById('modalTitle').innerText = `Estratégia: ${targetSymbol} (Depósito)`;
    
    const content = document.getElementById('modalContent');
    content.innerHTML = '';
    
    if (!currentPrice || currentPrice === 0) {
        content.innerHTML = `<p>Não podemos calcular a recomendação: preço atual do mercado não disponível.</p>`;
    } else if (txProfitLoss <= 0) {
        content.innerHTML = `
            <div class="recommendation-box">
                <h4><i data-lucide="alert-circle" class="text-negative"></i> Posição em Prejuízo ou Empate</h4>
                <p>O preço atual (${formatCurrency(currentPrice)}) está abaixo ou igual do preço de compra deste depósito (${formatCurrency(targetDep.buyPriceBRL)}).</p>
                <p style="margin-top: 10px;">Aguarde o ativo atingir os lucros para ver as metas de vendas dos Stops.</p>
            </div>
        `;
    } else {
        const targetQtdToSellForInitial = txInvested / currentPrice;
        const remainingToKeep = targetDep.quantity - targetQtdToSellForInitial;
        
        let stopMessage = `Seu lucro atual é de <strong>${txProfitPercent.toFixed(2)}%</strong>. `;
        if(txProfitPercent >= 30) stopMessage += `<span class="highlight">Você ultrapassou o 3º Stop! Lucro Excelente!</span>`;
        else if(txProfitPercent >= 25) stopMessage += `Você está no 2º Stop Gain (Acima 25%).`;
        else if(txProfitPercent >= 10) stopMessage += `Você está no 1º Stop Gain (Acima 10%).`;
        else stopMessage += `Você tem lucro, mas ainda não bateu o primeiro alvo de 10%.`;
        
        content.innerHTML = `
            <p style="margin-bottom: 1rem; color: var(--text-muted);">${stopMessage}</p>

            <div class="recommendation-box">
                <h4><i data-lucide="shield-check" class="text-positive"></i> Recuperar Capital Investido (${formatCurrency(txInvested)})</h4>
                <p>Para tirar seu risco e garantir o valor que pagou neste aporte:</p>
                <p style="margin-top:10px;">Venda: <span class="highlight">${formatNumber(targetQtdToSellForInitial, 6)} ${targetSymbol}</span></p>
                <p><small>(Você passará a brincar só com o lucro de ${formatNumber(remainingToKeep, 6)} ${targetSymbol}).</small></p>
            </div>
            
            <div class="recommendation-box">
                <h4><i data-lucide="coins" class="text-positive"></i> Realizar Apenas o Lucro (${formatCurrency(txProfitLoss)})</h4>
                <p>Se quiser sacar somente o rendimento para o seu bolso, mantendo o montante original ativo:</p>
                <p style="margin-top:10px;">Venda: <span class="highlight">${formatNumber(remainingToKeep, 6)} ${targetSymbol}</span></p>
            </div>
        `;
    }
    
    lucide.createIcons();
    modal.classList.add('show');
};

document.getElementById('closeModal').addEventListener('click', () => {
    modal.classList.remove('show');
});

document.getElementById('refreshPrices').addEventListener('click', fetchMarketPrices);

// Initial empty styling fix
document.head.insertAdjacentHTML('beforeend', `
<style>
.spin { animation: spin 1s linear infinite; }
@keyframes spin { 100% { transform: rotate(360deg); } }
.positive-bg { background: var(--positive-bg) !important; }
.negative-bg { background: var(--negative-bg) !important; }
</style>
`);

// Initialization
loadDataFromFirebase();

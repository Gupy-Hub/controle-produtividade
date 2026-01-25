// ARQUIVO: js/produtividade/consolidado.js

Produtividade.Consolidado = {
    initialized: false,
    ultimoCache: { key: null, data: null },
    overridesHC: {}, 
    dadosCalculados: null, 
    monthToColMap: null,
    
    // Cache de funções dos usuários (ID -> Funcao)
    mapaFuncoes: {},

    PADRAO_HC: 17,

    init: async function() { 
        console.log("🔧 Consolidado: Iniciando V9 (HC Limpo de Gestão)...");
        if(!this.initialized) { this.initialized = true; } 
        this.carregar();
    },

    getContextKey: function() {
        const datas = Produtividade.getDatasFiltro();
        let t = Produtividade.filtroPeriodo || 'mes';
        if (t === 'semana') t = 'dia'; 
        return `${t}_${datas.inicio}_${datas.fim}`;
    },

    carregarMapas: async function() {
        // Carrega mapa de funções apenas uma vez ou se vazio
        if (Object.keys(this.mapaFuncoes).length > 0) return;
        try {
            const { data } = await Sistema.supabase.from('usuarios').select('id, funcao');
            if (data) {
                data.forEach(u => this.mapaFuncoes[u.id] = (u.funcao || '').toUpperCase());
            }
        } catch (e) { console.error("Erro carregando funções:", e); }
    },

    carregarOverrides: async function() {
        const chave = this.getContextKey();
        this.overridesHC = {}; 
        try {
            const { data } = await Sistema.supabase.from('config_headcount').select('coluna_index, valor, motivo').eq('chave_contexto', chave);
            if (data) data.forEach(item => this.overridesHC[item.coluna_index] = { valor: item.valor, motivo: item.motivo });
        } catch (e) { console.error("Erro config:", e); }
    },

    salvarOverride: async function(colIndex, valor, motivo) {
        const chave = this.getContextKey();
        try {
            if (valor === null) {
                await Sistema.supabase.from('config_headcount').delete().match({ chave_contexto: chave, coluna_index: colIndex });
            } else {
                await Sistema.supabase.from('config_headcount').upsert({ chave_contexto: chave, coluna_index: colIndex, valor: valor, motivo: motivo }, { onConflict: 'chave_contexto, coluna_index' });
            }
        } catch (e) { alert("Erro ao salvar: " + e.message); }
    },

    atualizarHC: async function(colIndex, novoValor) {
        const val = parseInt(novoValor);
        if (isNaN(val) || val <= 0 || val === this.PADRAO_HC) { 
            delete this.overridesHC[colIndex]; 
            await this.salvarOverride(colIndex, null);
            this.renderizar(this.dadosCalculados); 
            return; 
        }
        const valorAtual = this.overridesHC[colIndex]?.valor;
        if (valorAtual === val) return;
        
        await new Promise(r => setTimeout(r, 50));
        const motivo = prompt(`O padrão é ${this.PADRAO_HC}. Mudando para ${val}.\nMotivo (Obrigatório):`);
        if (!motivo || motivo.trim() === "") { alert("❌ Cancelado: Motivo obrigatório."); this.renderizar(this.dadosCalculados); return; }
        
        this.overridesHC[colIndex] = { valor: val, motivo: motivo.trim() };
        await this.salvarOverride(colIndex, val, motivo.trim());
        if (this.dadosCalculados) this.renderizar(this.dadosCalculados);
    },
    
    carregar: async function(forcar = false) {
        const tbody = document.getElementById('cons-table-body'); 
        const datas = Produtividade.getDatasFiltro();
        const s = datas.inicio; const e = datas.fim;
        let t = Produtividade.filtroPeriodo || 'mes'; if (t === 'semana') t = 'dia';

        if(tbody) tbody.innerHTML = '<tr><td colspan="15" class="text-center py-10 text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl text-blue-500"></i></td></tr>';

        try {
            await Promise.all([this.carregarOverrides(), this.carregarMapas()]);

            const { data: rawData, error } = await Sistema.supabase
                .from('producao')
                .select('usuario_id, data_referencia, quantidade, fifo, gradual_total, gradual_parcial, perfil_fc, fator')
                .gte('data_referencia', s).lte('data_referencia', e); 

            if(error) throw error;
            
            this.ultimoCache = { key: this.getContextKey(), data: rawData, tipo: t };
            this.processarEExibir(rawData, t, s, e);
        } catch (e) { 
            console.error(e); 
            if(tbody) tbody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-rose-500">Erro: ${e.message}</td></tr>`; 
        }
    },

    getSemanasDoMes: function(year, month) {
        const weeks = [];
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        let currentDay = firstDay;
        while (currentDay <= lastDay) {
            const startOfWeek = new Date(currentDay);
            const dayOfWeek = currentDay.getDay(); 
            const daysToSaturday = 6 - dayOfWeek;
            let endOfWeek = new Date(currentDay);
            endOfWeek.setDate(currentDay.getDate() + daysToSaturday);
            if (endOfWeek > lastDay) endOfWeek = lastDay;
            weeks.push({ inicio: startOfWeek.toISOString().split('T')[0], fim: endOfWeek.toISOString().split('T')[0] });
            currentDay = new Date(endOfWeek);
            currentDay.setDate(currentDay.getDate() + 1);
        }
        return weeks;
    },

    processarDados: function(rawData, t, dataInicio, dataFim) {
        const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        let cols = []; let datesMap = {}; this.monthToColMap = {};

        const dIni = new Date(dataInicio + 'T12:00:00');
        const currentYear = dIni.getFullYear();
        const currentMonth = dIni.getMonth() + 1;

        if (t === 'dia') { 
            let curr = new Date(dataInicio + 'T12:00:00'); const end = new Date(dataFim + 'T12:00:00'); let idx = 1;
            while(curr <= end) {
                cols.push(String(curr.getDate()).padStart(2,'0'));
                datesMap[idx] = { ini: curr.toISOString().split('T')[0], fim: curr.toISOString().split('T')[0] }; 
                curr.setDate(curr.getDate() + 1); idx++;
            }
        } else if (t === 'mes') { 
            this.getSemanasDoMes(currentYear, currentMonth).forEach((s, i) => { cols.push(`Sem ${i+1}`); datesMap[i+1] = { ini: s.inicio, fim: s.fim }; }); 
        } else if (t === 'ano') { 
            const dFimObj = new Date(dataFim + 'T12:00:00');
            for(let i = dIni.getMonth(); i <= dFimObj.getMonth(); i++) { 
                cols.push(mesesNomes[i]); this.monthToColMap[i + 1] = cols.length;
                datesMap[cols.length] = { ini: `${currentYear}-${String(i+1).padStart(2,'0')}-01`, fim: `${currentYear}-${String(i+1).padStart(2,'0')}-${new Date(currentYear, i+1, 0).getDate()}` }; 
            } 
        }

        const numCols = cols.length;
        let st = {}; 
        for(let i=1; i<=numCols; i++) st[i] = { users: new Set(), diasUteis: 0, qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0 }; 
        st[99] = { users: new Set(), diasUteis: 0, qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0 }; 

        if(rawData) {
            rawData.forEach(r => {
                let b = -1;
                if (t === 'dia') { for(let k=1; k<=numCols; k++) if (datesMap[k].ini === r.data_referencia) b = k; } 
                else if (t === 'mes') { for(let k=1; k<=numCols; k++) if(r.data_referencia >= datesMap[k].ini && r.data_referencia <= datesMap[k].fim) b = k; } 
                else if (t === 'ano') { const mesData = parseInt(r.data_referencia.split('-')[1]); if (this.monthToColMap[mesData]) b = this.monthToColMap[mesData]; }

                if(b >= 1 && b <= numCols) {
                    [b, 99].forEach(k => {
                        // SOMA SEMPRE A PRODUÇÃO
                        st[k].qty += Number(r.quantidade) || 0; 
                        st[k].fifo += Number(r.fifo) || 0;
                        st[k].gt += Number(r.gradual_total) || 0;
                        st[k].gp += Number(r.gradual_parcial) || 0;
                        st[k].fc += Number(r.perfil_fc) || 0;
                        
                        // REGRA: SÓ CONTA NO HEADCOUNT/DIAS SE NÃO FOR GESTORA
                        const funcao = this.mapaFuncoes[r.usuario_id] || '';
                        const isManager = ['AUDITORA', 'GESTORA'].includes(funcao);
                        
                        if (!isManager) {
                            st[k].users.add(r.usuario_id); 
                            const fatorDb = (r.fator !== undefined && r.fator !== null) ? Number(r.fator) : 1;
                            st[k].diasUteis += fatorDb; 
                        }
                    });
                }
            });
        }
        return { cols, st, numCols };
    },

    processarEExibir: function(rawData, t, s, e) {
        this.dadosCalculados = this.processarDados(rawData, t, s, e);
        this.renderizar(this.dadosCalculados);
    },

    renderizar: function({ cols, st, numCols }) {
        const tbody = document.getElementById('cons-table-body');
        const hRow = document.getElementById('cons-table-header');
        if(!tbody || !hRow) return;

        let headerHTML = `<tr class="bg-slate-50 border-b border-slate-200"><th class="px-6 py-4 sticky left-0 bg-slate-50 z-20 border-r border-slate-200 text-left min-w-[250px]"><span class="text-xs font-black text-slate-400 uppercase tracking-widest">Indicador</span></th>`;
        
        cols.forEach((c, index) => {
            const colIdx = index + 1;
            const override = this.overridesHC[colIdx];
            const bgInput = override ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold' : 'bg-white border-slate-200';
            headerHTML += `<th class="px-2 py-2 text-center border-l border-slate-200 min-w-[80px]"><div class="flex flex-col items-center gap-1"><span class="text-xs font-bold text-slate-600 uppercase">${c}</span><input type="number" value="${override?.valor || ''}" placeholder="(${this.PADRAO_HC})" onchange="Produtividade.Consolidado.atualizarHC(${colIdx}, this.value)" class="w-full text-[10px] text-center rounded py-0.5 border ${bgInput} transition focus:ring-2 focus:ring-blue-200 outline-none"></div></th>`;
        });
        
        const overrideTotal = this.overridesHC[99];
        const bgInputTotal = overrideTotal ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold' : 'bg-white border-blue-200';
        headerHTML += `<th class="px-4 py-2 text-center bg-blue-50 border-l border-blue-100 min-w-[100px]"><div class="flex flex-col items-center gap-1"><span class="text-xs font-black text-blue-600 uppercase">TOTAL</span><input type="number" value="${overrideTotal?.valor || ''}" placeholder="(${this.PADRAO_HC})" onchange="Produtividade.Consolidado.atualizarHC(99, this.value)" class="w-full max-w-[60px] text-[10px] text-center rounded py-0.5 border ${bgInputTotal} outline-none"></div></th></tr>`;
        hRow.innerHTML = headerHTML;

        const mkRow = (label, icon, color, getter, isCalc=false, isBold=false) => {
            let tr = `<tr class="${isBold ? 'bg-slate-50/50' : ''} border-b border-slate-100 hover:bg-slate-50 transition"><td class="px-6 py-3 sticky left-0 bg-white z-10 border-r border-slate-200"><div class="flex items-center gap-3"><i class="${icon} ${color} text-sm w-4 text-center"></i><span class="text-xs uppercase ${isBold ? 'font-black' : 'font-medium'} text-slate-600">${label}</span></div></td>`;
            
            [...Array(numCols).keys()].map(i => i + 1).concat(99).forEach(i => {
                const s = st[i];
                const override = this.overridesHC[i];
                const HF = override ? override.valor : this.PADRAO_HC;
                const foundBySystem = s.users.size || 0; // Agora conta SÓ assistentes (graças ao filtro no loop)
                
                const val = isCalc ? getter(s, s.diasUteis, HF) : getter(s);
                let cellHTML = (val !== undefined && !isNaN(val)) ? Math.round(val).toLocaleString('pt-BR') : '-';
                
                if (label === 'Total de assistentes') {
                    if (override) {
                         const tooltip = `Padrão: ${this.PADRAO_HC} | Ativos (Assistentes): ${foundBySystem} | Motivo: ${override.motivo}`;
                        cellHTML = `<span title="${tooltip}" class="cursor-help text-amber-600 font-bold decoration-dotted underline decoration-amber-400 bg-amber-50 px-2 py-0.5 rounded text-[10px]">${cellHTML} <i class="fas fa-info-circle text-[8px] ml-0.5"></i></span>`;
                    } else {
                        cellHTML = `<span title="Assistentes Ativos: ${foundBySystem}" class="text-slate-400 cursor-default">${cellHTML}</span>`;
                    }
                } else {
                     if (cellHTML === '0' || cellHTML === '-') cellHTML = `<span class="text-slate-300">-</span>`;
                }
                
                tr += `<td class="px-4 py-3 text-center text-xs ${i === 99 ? 'bg-blue-50/30 font-bold text-blue-800' : 'text-slate-600'}">${cellHTML}</td>`;
            });
            return tr + '</tr>';
        };

        let rows = mkRow('Total de assistentes', 'fas fa-users-cog', 'text-indigo-400', (s, d, HF) => HF, true);
        rows += mkRow('Total de dias úteis trabalhado', 'fas fa-calendar-day', 'text-cyan-500', s => s.diasUteis);
        rows += mkRow('Total de documentos Fifo', 'fas fa-sort-amount-down', 'text-slate-400', s => s.fifo);
        rows += mkRow('Total de documentos Gradual Parcial', 'fas fa-chart-area', 'text-teal-500', s => s.gp);
        rows += mkRow('Total de documentos Gradual Total', 'fas fa-chart-line', 'text-emerald-500', s => s.gt);
        rows += mkRow('Total de documentos Perfil Fc', 'fas fa-id-card', 'text-purple-500', s => s.fc);
        rows += mkRow('Total de documentos validados', 'fas fa-layer-group', 'text-blue-600', s => s.qty, false, true);
        rows += mkRow('Total validação diária Dias úteis', 'fas fa-calendar-check', 'text-amber-600', (s, d, HF) => (d > 0) ? s.qty / d : 0, true);
        rows += mkRow('Média validação diária Todas assistentes', 'fas fa-users', 'text-orange-600', (s, d, HF) => (HF > 0) ? s.qty / HF : 0, true);
        rows += mkRow('Média validação diária Por Assistentes', 'fas fa-user-tag', 'text-pink-600', (s, d, HF) => (d > 0 && HF > 0) ? s.qty / d / HF : 0, true);
        
        tbody.innerHTML = rows;
        document.getElementById('total-consolidado-footer').innerText = this.overridesHC[99]?.valor || this.PADRAO_HC;
    }
};
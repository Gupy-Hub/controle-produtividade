const Cons = {
    initialized: false,
    ultimoCache: { key: null, data: null }, // Cache local

    init: function() { 
        if(!this.initialized) { 
            // Se mudar o input, força recarregamento (true)
            Sistema.Datas.criarInputInteligente('data-cons', KEY_DATA_GLOBAL, () => { this.carregar(true); }); 
            this.initialized = true; 
        } 
        setTimeout(() => this.carregar(false), 50); 
    },
    
    carregar: async function(forcar = false) {
        const tbody = document.getElementById('cons-table-body'); 
        const t = document.getElementById('cons-period-type').value; 
        
        // --- 1. LEITURA SEGURA DA DATA ---
        let refDate = Sistema.Datas.lerInput('data-cons');
        if (!refDate || isNaN(refDate.getTime())) refDate = new Date();

        // --- 2. FORMATAÇÃO MANUAL (LOCAL TIME) ---
        // Garante YYYY-MM-DD baseado na hora do computador, sem conversão UTC que muda o dia
        const anoLocal = refDate.getFullYear();
        const mesLocal = String(refDate.getMonth() + 1).padStart(2, '0');
        const diaLocal = String(refDate.getDate()).padStart(2, '0');
        const dataFormatadaISO = `${anoLocal}-${mesLocal}-${diaLocal}`;

        const inputHC = document.getElementById('cons-input-hc');
        const HF = inputHC ? (Number(inputHC.value) || 17) : 17;

        // Chave de cache usando a data formatada corretamente
        const cacheKey = `${t}_${dataFormatadaISO}_${HF}`;

        // Se não forçar e a chave for igual a anterior, usa cache
        if (!forcar && this.ultimoCache.key === cacheKey && this.ultimoCache.data) {
            this.renderizar(this.ultimoCache.data, t, HF);
            return;
        }

        if(tbody) tbody.innerHTML = '<tr><td colspan="15" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando...</td></tr>';
        
        // Definição de Datas de Início (s) e Fim (e)
        let s, e;
        
        if (t === 'dia') { 
            s = dataFormatadaISO; 
            e = dataFormatadaISO; 
        }
        else if (t === 'mes') { 
            s = `${anoLocal}-${mesLocal}-01`; 
            // Pega o último dia do mês corretamente (dia 0 do mês seguinte)
            const ultimoDia = new Date(anoLocal, mesLocal, 0).getDate();
            e = `${anoLocal}-${mesLocal}-${ultimoDia}`; 
        }
        else if (t === 'trimestre') { 
            const mesNum = parseInt(mesLocal);
            const trim = Math.ceil(mesNum / 3); 
            const mStart = ((trim-1)*3)+1; 
            const mEnd = mStart+2; 
            // Último dia do mês final do trimestre
            const ultimoDiaT = new Date(anoLocal, mEnd, 0).getDate();
            
            s = `${anoLocal}-${String(mStart).padStart(2,'0')}-01`; 
            e = `${anoLocal}-${String(mEnd).padStart(2,'0')}-${ultimoDiaT}`; 
        }
        else if (t === 'semestre') { 
            const mesNum = parseInt(mesLocal);
            const sem = Math.ceil(mesNum / 6); 
            s = sem === 1 ? `${anoLocal}-01-01` : `${anoLocal}-07-01`; 
            e = sem === 1 ? `${anoLocal}-06-30` : `${anoLocal}-12-31`; 
        } 
        else { 
            // Ano Completo
            s = `${anoLocal}-01-01`; 
            e = `${anoLocal}-12-31`; 
        }

        try {
            // Chama a procedure RPC otimizada no banco
            const { data: rawData, error } = await _supabase.rpc('get_consolidado_dados', { data_ini: s, data_fim: e });
            if(error) throw error;
            
            // Atualiza Cache
            this.ultimoCache = { key: cacheKey, data: rawData };
            this.renderizar(rawData, t, HF);
            
        } catch (e) { 
            console.error(e);
            if(tbody) tbody.innerHTML = '<tr><td colspan="15" class="text-center py-4 text-red-500">Erro ao carregar dados.</td></tr>';
        }
    },

    renderizar: function(rawData, t, HF) {
        const tbody = document.getElementById('cons-table-body');
        if (!tbody) return;

        let cols = []; 
        if (t === 'dia') cols = ['Dia']; 
        else if (t === 'mes') cols = ['S1','S2','S3','S4','S5']; 
        else if (t === 'trimestre') cols = ['Mês 1','Mês 2','Mês 3']; 
        else if (t === 'semestre') cols = ['M1','M2','M3','M4','M5','M6']; 
        else cols = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        
        const numCols = cols.length; 
        let st = {}; for(let i=1; i<=numCols; i++) st[i] = this.newStats(); st[99] = this.newStats();
        
        if(rawData) {
            rawData.forEach(r => {
                let b = 1; 
                // data_ref vem do banco como YYYY-MM-DD
                const parts = r.data_ref.split('-'); 
                const dt = new Date(parts[0], parts[1]-1, parts[2]);

                if(t === 'mes') { const firstDay = new Date(dt.getFullYear(), dt.getMonth(), 1).getDay(); b = Math.ceil((dt.getDate() + firstDay) / 7); }
                else if (t === 'trimestre') b = (dt.getMonth() % 3) + 1; 
                else if (t === 'semestre') b = (dt.getMonth() % 6) + 1; 
                else if (t === 'ano_mes') b = dt.getMonth() + 1;
                
                if(b > numCols) b = numCols;
                
                const sys = Number(r.soma_quantidade) || 0;
                
                const populate = (k) => {
                    if(!st[k]) return;
                    const x = st[k];
                    x.users.add(r.nome_assistente); 
                    x.dates.add(r.data_ref); 
                    x.qty += sys; 
                    x.fifo += (Number(r.soma_fifo)||0); 
                    x.gt += (Number(r.soma_gradual_total)||0); 
                    x.gp += (Number(r.soma_gradual_parcial)||0); 
                    x.fc += (Number(r.soma_perfil_fc)||0);
                    if (r.contrato && r.contrato.includes('CLT')) { x.clt_users.add(r.nome_assistente); x.clt_qty += sys; } 
                    else { x.pj_users.add(r.nome_assistente); x.pj_qty += sys; }
                };
                populate(b);
                populate(99);
            });
        }

        const hRow = document.getElementById('cons-table-header'); 
        if(hRow) hRow.innerHTML = `<th class="px-4 py-3 sticky left-0 bg-slate-50 z-20 border-r border-slate-200">Indicadores</th>` + cols.map(c => `<th class="px-4 py-3 text-center border-l border-slate-100">${c}</th>`).join('') + `<th class="px-4 py-3 text-center bg-blue-50 text-blue-800 border-l border-blue-100">TOTAL</th>`;
        
        let h = ''; 
        const idxs = [...Array(numCols).keys()].map(i => i + 1); idxs.push(99);
        
        const mkRow = (label, getter, isCalc=false, isBold=false, isSub=false) => {
            const rowClass = isBold ? 'row-total' : (isSub ? 'row-sub' : 'hover:bg-slate-50'); 
            let tr = `<tr class="${rowClass} border-b border-slate-100"><td class="px-4 py-3 font-medium col-fixed">${label}</td>`;
            idxs.forEach(i => {
                const s = st[i]; const dias = s.dates.size || 1; const ativos = s.users.size || 1; const ac = s.clt_users.size || 1; const ap = s.pj_users.size || 1;
                let val = 0; if (!isCalc) { val = getter(s); if (val instanceof Set) val = val.size; } else { val = getter(s, dias, ativos, ac, ap); }
                const txt = val ? Math.round(val).toLocaleString() : (isBold ? '0' : '-'); const cellClass = i === 99 ? 'bg-blue-50 font-bold border-l border-blue-100 text-blue-900' : 'text-center border-l border-slate-50'; tr += `<td class="${cellClass} px-2 py-2">${txt}</td>`;
            });
            return tr + '</tr>';
        };
        
        h += mkRow('Assistentes Ativas', s => s.users); 
        h += mkRow('Dias Trabalhados', s => s.dates); 
        h += mkRow('FIFO', s => s.fifo); 
        h += mkRow('G. Parcial', s => s.gp); 
        h += mkRow('G. Total', s => s.gt); 
        h += mkRow('Perfil FC', s => s.fc); 
        h += mkRow('Produção Total', s => s.qty, false, true);
        h += mkRow('Média Diária (Time)', (s, d) => s.qty / d, true); 
        h += mkRow(`Média/Assist (Base ${HF})`, (s) => s.qty / HF, true); 
        h += mkRow(`Média Dia/Assist (Base ${HF})`, (s, d) => s.qty / d / HF, true);
        h += `<tr><td colspan="${numCols + 2}" class="px-4 py-6 bg-slate-50 font-bold text-slate-400 text-xs uppercase tracking-widest text-center border-y border-slate-200">Segmentação por Contrato</td></tr>`;
        h += mkRow('Produção CLT', s => s.clt_qty); h += mkRow('Média Diária/CLT', (s, d, a, ac) => s.clt_qty / d / ac, true);
        h += mkRow('Produção PJ', s => s.pj_qty); h += mkRow('Média Diária/PJ', (s, d, a, ac, ap) => s.pj_qty / d / ap, true);
        
        tbody.innerHTML = h;
        
        const tot = st[99]; const dTot = tot.dates.size || 1; 
        
        // Função segura para evitar erros caso elementos não existam
        const setSafe = (id, v) => { const el = document.getElementById(id); if(el) el.innerText = v; };
        
        setSafe('cons-p-total', tot.qty.toLocaleString()); 
        setSafe('cons-p-media-time', Math.round(tot.qty / dTot).toLocaleString()); 
        setSafe('cons-p-media-ind', Math.round(tot.qty / dTot / HF).toLocaleString()); 
        setSafe('cons-p-headcount', tot.users.size);
    },
    
    newStats: function() { return { users: new Set(), dates: new Set(), qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0, clt_users: new Set(), clt_qty: 0, pj_users: new Set(), pj_qty: 0 }; }
};
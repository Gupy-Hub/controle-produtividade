const Cons = {
    initialized: false,
    ultimoCache: { key: null, data: null },

    init: async function() { 
        if(!this.initialized) { 
            this.initialized = true; 
        } 
        setTimeout(() => this.carregar(false), 50); 
    },
    
    carregar: async function(forcar = false) {
        const tbody = document.getElementById('cons-table-body'); 
        const t = document.getElementById('cons-period-type').value; 
        
        if (!Sistema.Dados.inicializado) await Sistema.Dados.inicializar();
        Sistema.Dados.inicializar(); 

        let el = document.getElementById('global-date');
        let val = el ? el.value : new Date().toISOString().split('T')[0];
        
        let dia, mes, ano;
        if (val.includes('-')) { [ano, mes, dia] = val.split('-').map(Number); }
        else { const now = new Date(); dia = now.getDate(); mes = now.getMonth() + 1; ano = now.getFullYear(); }

        const inputHC = document.getElementById('cons-input-hc');
        const HF = inputHC ? (Number(inputHC.value) || 17) : 17;

        const sAno = String(ano); const sMes = String(mes).padStart(2, '0'); const sDia = String(dia).padStart(2, '0');
        const dataSql = `${sAno}-${sMes}-${sDia}`;
        
        let s, e;
        if (t === 'dia') { s = dataSql; e = dataSql; }
        else if (t === 'mes') { s = `${sAno}-${sMes}-01`; e = `${sAno}-${sMes}-${new Date(ano, mes, 0).getDate()}`; }
        else if (t === 'trimestre') { const trim = Math.ceil(mes / 3); const mStart = ((trim-1)*3)+1; s = `${sAno}-${String(mStart).padStart(2,'0')}-01`; e = `${sAno}-${String(mStart+2).padStart(2,'0')}-${new Date(ano, mStart+2, 0).getDate()}`; }
        else if (t === 'semestre') { const sem = Math.ceil(mes / 6); s = sem === 1 ? `${sAno}-01-01` : `${sAno}-07-01`; e = sem === 1 ? `${sAno}-06-30` : `${sAno}-12-31`; } 
        else { s = `${sAno}-01-01`; e = `${sAno}-12-31`; }

        const cacheKey = `${t}_${s}_${e}_${HF}`;

        if (!forcar && this.ultimoCache.key === cacheKey && this.ultimoCache.data) {
            this.renderizar(this.ultimoCache.data, t, HF);
            return;
        }

        if(tbody) tbody.innerHTML = '<tr><td colspan="15" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Calculando Consolidação...</td></tr>';

        try {
            const { data: rawData, error } = await _supabase
                .from('producao')
                .select('usuario_id, data_referencia, quantidade, fifo, gradual_total, gradual_parcial, perfil_fc')
                .gte('data_referencia', s)
                .lte('data_referencia', e);
                
            if(error) throw error;
            
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
                const user = Sistema.Dados.usuariosCache[r.usuario_id];
                if(!user || user.funcao !== 'Assistente') return;

                const nome = user.nome;
                const sys = Number(r.quantidade) || 0;
                
                const fator = Sistema.Dados.obterFator(nome, r.data_referencia);
                
                let b = 1; 
                const parts = r.data_referencia.split('-'); 
                const dt = new Date(parts[0], parts[1]-1, parts[2]);

                if(t === 'mes') { const firstDay = new Date(dt.getFullYear(), dt.getMonth(), 1).getDay(); b = Math.ceil((dt.getDate() + firstDay) / 7); }
                else if (t === 'trimestre') b = (dt.getMonth() % 3) + 1; 
                else if (t === 'semestre') b = (dt.getMonth() % 6) + 1; 
                else if (t === 'ano_mes') b = dt.getMonth() + 1;
                
                if(b > numCols) b = numCols;

                const populate = (k) => {
                    if(!st[k]) return;
                    const x = st[k];
                    x.users.add(nome); 
                    
                    if (!x.diasMap[r.data_referencia]) x.diasMap[r.data_referencia] = 0;
                    x.diasPonderados += fator; 

                    x.qty += sys; 
                    x.fifo += (Number(r.fifo)||0); 
                    x.gt += (Number(r.gradual_total)||0); 
                    x.gp += (Number(r.gradual_parcial)||0); 
                    x.fc += (Number(r.perfil_fc)||0);
                    
                    if (user.contrato && user.contrato.includes('CLT')) { 
                        x.clt_users.add(nome); 
                        x.clt_qty += sys; 
                        x.clt_dias += fator;
                    } else { 
                        x.pj_users.add(nome); 
                        x.pj_qty += sys;
                        x.pj_dias += fator;
                    }
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
                const s = st[i]; 
                const diasReais = s.diasPonderados; 
                const ativos = s.users.size || 1; 
                
                let val = 0; 
                if (!isCalc) { 
                    val = getter(s); 
                    if (val instanceof Set) val = val.size; 
                } else { 
                    val = getter(s, diasReais, ativos, s.clt_dias, s.pj_dias); 
                }
                const txt = val ? Math.round(val).toLocaleString() : (isBold ? '0' : '-'); 
                const cellClass = i === 99 ? 'bg-blue-50 font-bold border-l border-blue-100 text-blue-900' : 'text-center border-l border-slate-50'; 
                tr += `<td class="${cellClass} px-2 py-2">${txt}</td>`;
            });
            return tr + '</tr>';
        };
        
        h += mkRow('Assistentes Ativas (Produção)', s => s.users); 
        h += mkRow('Dias Trabalhados (Fator)', s => s.diasPonderados); 
        h += mkRow('FIFO', s => s.fifo); 
        h += mkRow('G. Parcial', s => s.gp); 
        h += mkRow('G. Total', s => s.gt); 
        h += mkRow('Perfil FC', s => s.fc); 
        h += mkRow('Produção Total', s => s.qty, false, true);
        h += mkRow('Média Diária (Time)', (s, d) => d > 0 ? s.qty / d : 0, true); 
        h += mkRow(`Média/Assist (Base ${HF})`, (s) => s.qty / HF, true); 
        h += mkRow(`Média Dia/Assist (Base ${HF})`, (s, d) => d > 0 ? s.qty / d / HF : 0, true);
        h += `<tr><td colspan="${numCols + 2}" class="px-4 py-6 bg-slate-50 font-bold text-slate-400 text-xs uppercase tracking-widest text-center border-y border-slate-200">Segmentação por Contrato</td></tr>`;
        h += mkRow('Produção CLT', s => s.clt_qty); 
        h += mkRow('Média Diária/CLT', (s, d, a, dc, dp) => dc > 0 ? s.clt_qty / dc : 0, true);
        h += mkRow('Produção PJ', s => s.pj_qty); 
        h += mkRow('Média Diária/PJ', (s, d, a, dc, dp) => dp > 0 ? s.pj_qty / dp : 0, true);
        
        tbody.innerHTML = h;
        
        const tot = st[99]; 
        const dTot = tot.diasPonderados || 1; 
        
        const setSafe = (id, v) => { const el = document.getElementById(id); if(el) el.innerText = v; };
        
        setSafe('cons-p-total', tot.qty.toLocaleString()); 
        setSafe('cons-p-media-time', Math.round(tot.qty / dTot).toLocaleString()); 
        setSafe('cons-p-media-ind', Math.round(tot.qty / dTot / HF).toLocaleString());
        
        // --- ATUALIZAÇÕES SOLICITADAS ---
        // 1. Atualiza Badge Base
        const elBadge = document.getElementById('cons-badge-base');
        if (elBadge) elBadge.innerText = `Base ${HF}`;
        
        // 2. Card "Assistentes Ativas" agora mostra o valor digitado (HF)
        setSafe('cons-p-headcount', HF); 
        // -------------------------------
    },
    
    newStats: function() { 
        return { 
            users: new Set(), 
            diasMap: {}, 
            diasPonderados: 0,
            qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0, 
            clt_users: new Set(), clt_qty: 0, clt_dias: 0,
            pj_users: new Set(), pj_qty: 0, pj_dias: 0
        }; 
    }
};
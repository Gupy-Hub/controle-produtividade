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
        else { s = `${sAno}-01-01`; e = `${sAno}-12-31`; } // Para ano_mes e ano_trim

        const cacheKey = `${t}_${s}_${e}_${HF}`;

        if (!forcar && this.ultimoCache.key === cacheKey && this.ultimoCache.data) {
            this.renderizar(this.ultimoCache.data, t, HF, mes);
            return;
        }

        if(tbody) tbody.innerHTML = '<tr><td colspan="15" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Atualizando Indicadores...</td></tr>';

        try {
            const { data: rawData, error } = await _supabase
                .from('producao')
                .select('usuario_id, data_referencia, quantidade, fifo, gradual_total, gradual_parcial, perfil_fc')
                .gte('data_referencia', s)
                .lte('data_referencia', e);
                
            if(error) throw error;
            
            this.ultimoCache = { key: cacheKey, data: rawData };
            this.renderizar(rawData, t, HF, mes);
            
        } catch (e) { 
            console.error(e);
            if(tbody) tbody.innerHTML = '<tr><td colspan="15" class="text-center py-4 text-red-500">Erro ao carregar dados.</td></tr>';
        }
    },

    renderizar: function(rawData, t, HF, currentMonth) {
        const tbody = document.getElementById('cons-table-body');
        if (!tbody) return;

        // --- GERAÇÃO DINÂMICA DE COLUNAS ---
        const mesesNomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        let cols = []; 
        let startMonthIdx = 0; // 0-based

        if (t === 'dia') {
            cols = ['Dia Atual']; 
        } else if (t === 'mes') {
            cols = ['Semana 1','Semana 2','Semana 3','Semana 4','Semana 5']; 
        } else if (t === 'trimestre') {
            const trim = Math.ceil(currentMonth / 3);
            startMonthIdx = (trim - 1) * 3;
            cols = [mesesNomes[startMonthIdx], mesesNomes[startMonthIdx+1], mesesNomes[startMonthIdx+2]];
        } else if (t === 'semestre') {
            const sem = Math.ceil(currentMonth / 6);
            startMonthIdx = (sem - 1) * 6;
            cols = mesesNomes.slice(startMonthIdx, startMonthIdx + 6);
        } else if (t === 'ano_trim') {
            cols = ['1º Trimestre', '2º Trimestre', '3º Trimestre', '4º Trimestre'];
        } else { // ano_mes
            cols = mesesNomes; // Todos os 12
        }
        
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
                const mIdx = dt.getMonth(); // 0-11

                if (t === 'mes') { 
                    const firstDay = new Date(dt.getFullYear(), dt.getMonth(), 1).getDay(); 
                    b = Math.ceil((dt.getDate() + firstDay) / 7); 
                } 
                else if (t === 'trimestre') { 
                    // Ajusta índice relativo ao trimestre (0, 1, 2)
                    b = (mIdx % 3) + 1; 
                } 
                else if (t === 'semestre') { 
                    // Ajusta índice relativo ao semestre (0 a 5)
                    b = (mIdx % 6) + 1; 
                } 
                else if (t === 'ano_trim') {
                    // Agrupa por trimestre (1 a 4)
                    b = Math.ceil((mIdx + 1) / 3);
                }
                else if (t === 'ano_mes') { 
                    b = mIdx + 1; 
                }
                
                if(b > numCols) b = numCols; // Segurança

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
                        x.clt_users.add(nome); x.clt_qty += sys; x.clt_dias += fator;
                    } else { 
                        x.pj_users.add(nome); x.pj_qty += sys; x.pj_dias += fator;
                    }
                };
                populate(b);
                populate(99);
            });
        }

        const hRow = document.getElementById('cons-table-header'); 
        if(hRow) hRow.innerHTML = `
            <th class="px-6 py-4 sticky left-0 bg-white z-20 border-b-2 border-slate-100 text-left min-w-[200px]">
                <span class="text-xs font-black text-slate-400 uppercase tracking-widest">Indicador</span>
            </th>` + 
            cols.map(c => `<th class="px-4 py-4 text-center border-b-2 border-slate-100"><span class="text-xs font-bold text-slate-500 uppercase">${c}</span></th>`).join('') + 
            `<th class="px-6 py-4 text-center bg-slate-50 border-b-2 border-slate-100 border-l border-slate-100 min-w-[120px]">
                <span class="text-xs font-black text-blue-600 uppercase tracking-widest">TOTAL</span>
            </th>`;
        
        let h = ''; 
        const idxs = [...Array(numCols).keys()].map(i => i + 1); idxs.push(99);
        
        const mkRow = (label, icon, colorInfo, getter, isCalc=false, isBold=false) => {
            const rowBg = isBold ? 'bg-slate-50/50' : 'hover:bg-slate-50 transition-colors';
            const iconColor = colorInfo || 'text-slate-400';
            const textColor = isBold ? 'text-slate-800' : 'text-slate-600';
            const fontWeight = isBold ? 'font-black' : 'font-medium';
            
            let tr = `<tr class="${rowBg} border-b border-slate-50 last:border-0 group">
                <td class="px-6 py-4 sticky left-0 bg-white z-10 border-r border-slate-50 group-hover:bg-slate-50 transition-colors shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)]">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100">
                            <i class="${icon} ${iconColor} text-sm"></i>
                        </div>
                        <span class="${textColor} ${fontWeight} text-xs uppercase tracking-wide">${label}</span>
                    </div>
                </td>`;
            
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
                
                const txt = val ? Math.round(val).toLocaleString() : '-';
                const cellClass = i === 99 
                    ? `px-6 py-4 text-center bg-slate-50 border-l border-slate-100 font-bold ${colorInfo ? colorInfo.replace('text-', 'text-') : 'text-slate-700'}` 
                    : `px-4 py-4 text-center text-slate-500 font-medium`;
                
                tr += `<td class="${cellClass}">${txt}</td>`;
            });
            return tr + '</tr>';
        };
        
        h += mkRow('Assistentes Ativas', 'fas fa-users', 'text-indigo-500', s => s.users); 
        h += mkRow('Dias Trabalhados', 'fas fa-calendar-check', 'text-cyan-500', s => s.diasPonderados); 
        h += mkRow('Produção Total', 'fas fa-layer-group', 'text-blue-600', s => s.qty, false, true);
        
        h += mkRow('Média (Time)', 'fas fa-chart-line', 'text-emerald-600', (s, d) => d > 0 ? s.qty / d : 0, true); 
        h += mkRow(`Média (Base ${HF})`, 'fas fa-user-tag', 'text-amber-600', (s) => s.qty / HF, true); 
        
        h += `<tr><td colspan="${numCols + 2}" class="px-6 py-6 bg-slate-50/50">
                <div class="flex items-center gap-4">
                    <div class="h-px bg-slate-200 flex-1"></div>
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]"><i class="fas fa-file-signature mr-2"></i>Segmentação por Contrato</span>
                    <div class="h-px bg-slate-200 flex-1"></div>
                </div>
              </td></tr>`;

        h += mkRow('Produção CLT', 'fas fa-building', 'text-blue-500', s => s.clt_qty); 
        h += mkRow('Média Diária CLT', 'fas fa-calculator', 'text-blue-400', (s, d, a, dc, dp) => dc > 0 ? s.clt_qty / dc : 0, true);
        h += mkRow('Produção PJ', 'fas fa-briefcase', 'text-indigo-500', s => s.pj_qty); 
        h += mkRow('Média Diária PJ', 'fas fa-calculator', 'text-indigo-400', (s, d, a, dc, dp) => dp > 0 ? s.pj_qty / dp : 0, true);

        h += `<tr><td colspan="${numCols + 2}" class="h-4"></td></tr>`;
        h += mkRow('FIFO', 'fas fa-clock', 'text-slate-400', s => s.fifo); 
        h += mkRow('Gradual Total', 'fas fa-check-double', 'text-slate-400', s => s.gt); 
        
        tbody.innerHTML = h;
        
        const tot = st[99]; 
        const dTot = tot.diasPonderados || 1; 
        const setSafe = (id, v) => { const el = document.getElementById(id); if(el) el.innerText = v; };
        
        setSafe('cons-p-total', tot.qty.toLocaleString()); 
        setSafe('cons-p-media-time', Math.round(tot.qty / dTot).toLocaleString()); 
        setSafe('cons-p-media-ind', Math.round(tot.qty / dTot / HF).toLocaleString());
        
        // --- ATUALIZADO: Mostra Contagem REAL de Ativas no Card ---
        setSafe('cons-p-headcount', tot.users.size); 
        // Atualiza Badge do Input
        const elBadge = document.getElementById('cons-badge-base');
        if (elBadge) elBadge.innerText = `Base ${HF}`;
    },
    
    newStats: function() { 
        return { 
            users: new Set(), diasMap: {}, diasPonderados: 0,
            qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0, 
            clt_users: new Set(), clt_qty: 0, clt_dias: 0,
            pj_users: new Set(), pj_qty: 0, pj_dias: 0
        }; 
    }
};
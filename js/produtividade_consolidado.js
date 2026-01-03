const Cons = {
    initialized: false,
    ultimoCache: { key: null, data: null },

    init: async function() { 
        if(!this.initialized) { 
            this.initialized = true; 
        } 
        this.togglePeriodo();
        setTimeout(() => this.carregar(false), 50); 
    },

    togglePeriodo: function() {
        const t = document.getElementById('cons-period-type').value;
        const selQ = document.getElementById('cons-select-quarter');
        const selS = document.getElementById('cons-select-semester');
        
        if(selQ) selQ.classList.add('hidden');
        if(selS) selS.classList.add('hidden');

        if (t === 'trimestre' && selQ) {
            selQ.classList.remove('hidden');
            const globalDate = document.getElementById('global-date').value;
            if(globalDate) {
                const m = parseInt(globalDate.split('-')[1]);
                selQ.value = Math.ceil(m / 3);
            }
        } 
        else if (t === 'semestre' && selS) {
            selS.classList.remove('hidden');
            const globalDate = document.getElementById('global-date').value;
            if(globalDate) {
                const m = parseInt(globalDate.split('-')[1]);
                selS.value = m <= 6 ? 1 : 2;
            }
        }
        
        this.carregar(false); 
    },
    
    calcularDiasUteisCalendario: function(dataInicio, dataFim) {
        let count = 0;
        let cur = new Date(dataInicio + 'T12:00:00'); 
        const end = new Date(dataFim + 'T12:00:00');
        while (cur <= end) {
            const day = cur.getDay();
            if (day !== 0 && day !== 6) count++;
            cur.setDate(cur.getDate() + 1);
        }
        return count;
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

        const sAno = String(ano); const sMes = String(mes).padStart(2, '0');
        let s, e;
        
        if (t === 'dia') { s = `${sAno}-${sMes}-01`; e = `${sAno}-${sMes}-${new Date(ano, mes, 0).getDate()}`; }
        else if (t === 'mes') { s = `${sAno}-${sMes}-01`; e = `${sAno}-${sMes}-${new Date(ano, mes, 0).getDate()}`; }
        else if (t === 'trimestre') { 
            const selQ = document.getElementById('cons-select-quarter');
            const trim = selQ ? parseInt(selQ.value) : Math.ceil(mes / 3); 
            const mStart = ((trim-1)*3)+1; 
            s = `${sAno}-${String(mStart).padStart(2,'0')}-01`; 
            e = `${sAno}-${String(mStart+2).padStart(2,'0')}-${new Date(ano, mStart+2, 0).getDate()}`; 
        }
        else if (t === 'semestre') { 
            const selS = document.getElementById('cons-select-semester');
            const sem = selS ? parseInt(selS.value) : (mes <= 6 ? 1 : 2);
            s = sem === 1 ? `${sAno}-01-01` : `${sAno}-07-01`; 
            e = sem === 1 ? `${sAno}-06-30` : `${sAno}-12-31`; 
        } 
        else { s = `${sAno}-01-01`; e = `${sAno}-12-31`; }

        const HF = Sistema.Dados.calcularMediaBasePeriodo(s, e);
        const cacheKey = `${t}_${s}_${e}_${HF}`;

        if (!forcar && this.ultimoCache.key === cacheKey && this.ultimoCache.data) {
            this.renderizar(this.ultimoCache.data, t, HF, mes, ano);
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
            this.renderizar(rawData, t, HF, mes, ano);
            
        } catch (e) { 
            console.error(e);
            if(tbody) tbody.innerHTML = '<tr><td colspan="15" class="text-center py-4 text-red-500">Erro ao carregar dados.</td></tr>';
        }
    },

    renderizar: function(rawData, t, HF, currentMonth, currentYear) {
        const tbody = document.getElementById('cons-table-body');
        if (!tbody) return;

        const tableWrapper = document.getElementById('cons-table-wrapper');
        if (t === 'dia') tableWrapper.classList.add('scroll-top-wrapper');
        else tableWrapper.classList.remove('scroll-top-wrapper');

        const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        let cols = []; 
        let datesMap = {}; 

        if (t === 'dia') { 
            const lastDay = new Date(currentYear, currentMonth, 0).getDate();
            for(let d=1; d<=lastDay; d++) {
                cols.push(String(d).padStart(2,'0'));
                datesMap[d] = { ini: `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`, fim: `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}` };
            }
        } 
        else if (t === 'mes') { cols = ['Semana 1','Semana 2','Semana 3','Semana 4','Semana 5']; } 
        else if (t === 'trimestre') {
            const selQ = document.getElementById('cons-select-quarter');
            const trim = selQ ? parseInt(selQ.value) : Math.ceil(currentMonth / 3);
            const idxStart = (trim - 1) * 3;
            cols = [mesesNomes[idxStart], mesesNomes[idxStart+1], mesesNomes[idxStart+2]];
            for(let i=0; i<3; i++) {
                const m = idxStart + i + 1;
                const ultimoDia = new Date(currentYear, m, 0).getDate();
                datesMap[i+1] = { ini: `${currentYear}-${String(m).padStart(2,'0')}-01`, fim: `${currentYear}-${String(m).padStart(2,'0')}-${ultimoDia}` };
            }
        } else if (t === 'semestre') {
            const selS = document.getElementById('cons-select-semester');
            const sem = selS ? parseInt(selS.value) : (currentMonth <= 6 ? 1 : 2);
            const idxStart = (sem - 1) * 6;
            cols = mesesNomes.slice(idxStart, idxStart + 6);
            for(let i=0; i<6; i++) {
                const m = idxStart + i + 1;
                const ultimoDia = new Date(currentYear, m, 0).getDate();
                datesMap[i+1] = { ini: `${currentYear}-${String(m).padStart(2,'0')}-01`, fim: `${currentYear}-${String(m).padStart(2,'0')}-${ultimoDia}` };
            }
        } else if (t === 'ano_trim') {
            cols = ['1º Trim', '2º Trim', '3º Trim', '4º Trim'];
        } else { 
            cols = mesesNomes; 
            for(let i=0; i<12; i++) {
                const m = i + 1;
                const ultimoDia = new Date(currentYear, m, 0).getDate();
                datesMap[i+1] = { ini: `${currentYear}-${String(m).padStart(2,'0')}-01`, fim: `${currentYear}-${String(m).padStart(2,'0')}-${ultimoDia}` };
            }
        }
        
        const numCols = cols.length; 
        let st = {}; for(let i=1; i<=numCols; i++) st[i] = this.newStats(); st[99] = this.newStats();
        
        const uniqueUsers = new Set();
        if(rawData) {
            rawData.forEach(r => {
                uniqueUsers.add(r.usuario_id);
                const user = Sistema.Dados.usuariosCache[r.usuario_id];
                if(!user || user.funcao !== 'Assistente') return;
                const nome = user.nome; const sys = Number(r.quantidade) || 0;
                let b = 1; 
                const parts = r.data_referencia.split('-'); const dt = new Date(parts[0], parts[1]-1, parts[2]); const mIdx = dt.getMonth(); const dDia = dt.getDate();

                if (t === 'dia') b = dDia;
                else if (t === 'mes') { const firstDay = new Date(dt.getFullYear(), dt.getMonth(), 1).getDay(); b = Math.ceil((dt.getDate() + firstDay) / 7); } 
                else if (t === 'trimestre') { const selQ = document.getElementById('cons-select-quarter'); const trim = selQ ? parseInt(selQ.value) : Math.ceil(currentMonth / 3); const startM = (trim-1)*3; b = (mIdx - startM) + 1; } 
                else if (t === 'semestre') { const selS = document.getElementById('cons-select-semester'); const sem = selS ? parseInt(selS.value) : (currentMonth <= 6 ? 1 : 2); const startM = (sem-1)*6; b = (mIdx - startM) + 1; } 
                else if (t === 'ano_trim') b = Math.ceil((mIdx + 1) / 3);
                else if (t === 'ano_mes') b = mIdx + 1;
                
                if(b >= 1 && b <= numCols) {
                    const populate = (k) => {
                        if(!st[k]) return;
                        st[k].users.add(nome); st[k].dates.add(r.data_referencia);
                        st[k].qty += sys; st[k].fifo += (Number(r.fifo)||0); st[k].gt += (Number(r.gradual_total)||0); st[k].gp += (Number(r.gradual_parcial)||0); st[k].fc += (Number(r.perfil_fc)||0);
                    };
                    populate(b); populate(99); 
                }
            });
        }

        for(let i=1; i<=numCols; i++) {
            if(datesMap[i]) st[i].diasUteis = this.calcularDiasUteisCalendario(datesMap[i].ini, datesMap[i].fim);
            else if (t === 'dia') st[i].diasUteis = this.calcularDiasUteisCalendario(`${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(i).padStart(2,'0')}`, `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(i).padStart(2,'0')}`);
            else st[i].diasUteis = st[i].dates.size; 
        }
        if (t === 'mes' || t === 'dia') {
            const lastDay = new Date(currentYear, currentMonth, 0).getDate();
            st[99].diasUteis = this.calcularDiasUteisCalendario(`${currentYear}-${String(currentMonth).padStart(2,'0')}-01`, `${currentYear}-${String(currentMonth).padStart(2,'0')}-${lastDay}`);
        } else {
            st[99].diasUteis = 0; for(let i=1; i<=numCols; i++) st[99].diasUteis += st[i].diasUteis;
        }

        const hRow = document.getElementById('cons-table-header'); 
        if(hRow) hRow.innerHTML = `<th class="px-6 py-4 sticky left-0 bg-white z-20 border-b-2 border-slate-100 text-left min-w-[200px]"><span class="text-xs font-black text-slate-400 uppercase tracking-widest">Indicador</span></th>` + cols.map(c => `<th class="px-4 py-4 text-center border-b-2 border-slate-100"><span class="text-xs font-bold text-slate-500 uppercase">${c}</span></th>`).join('') + `<th class="px-6 py-4 text-center bg-slate-50 border-b-2 border-slate-100 border-l border-slate-100 min-w-[120px]"><span class="text-xs font-black text-blue-600 uppercase tracking-widest">TOTAL</span></th>`;
        
        let h = ''; 
        const idxs = [...Array(numCols).keys()].map(i => i + 1); idxs.push(99);
        
        // --- CÁLCULO REAL E CONTAGEM CLT / PJ ---
        const sysHC = uniqueUsers.size; // Total Real
        let countCLT = 0;
        let countPJ = 0;
        let countOutros = 0;
        
        uniqueUsers.forEach(uid => {
            const u = Sistema.Dados.usuariosCache[uid];
            if (u) {
                const c = (u.contrato || '').toUpperCase();
                if (c.includes('CLT')) countCLT++;
                else if (c.includes('PJ')) countPJ++;
                else countOutros++;
            } else {
                countOutros++; // Usuário não encontrado no cache mas está na produção
            }
        });

        // Força a soma bater com o total
        if ((countCLT + countPJ + countOutros) !== sysHC) {
            countOutros = sysHC - (countCLT + countPJ);
        }

        const mkRow = (label, icon, colorInfo, getter, isCalc=false, isBold=false) => {
            const rowBg = isBold ? 'bg-slate-50/50' : 'hover:bg-slate-50 transition-colors';
            const iconColor = colorInfo || 'text-slate-400';
            const textColor = isBold ? 'text-slate-800' : 'text-slate-600';
            const fontWeight = isBold ? 'font-black' : 'font-medium';
            
            let tr = `<tr class="${rowBg} border-b border-slate-50 last:border-0 group">
                <td class="px-6 py-4 sticky left-0 bg-white z-10 border-r border-slate-50 group-hover:bg-slate-50 transition-colors shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)]">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100"><i class="${icon} ${iconColor} text-sm"></i></div>
                        <span class="${textColor} ${fontWeight} text-xs uppercase tracking-wide">${label}</span>
                    </div>
                </td>`;
            
            idxs.forEach(i => {
                const s = st[i]; 
                const diasCal = s.diasUteis; 
                
                // --- LÓGICA CRUCIAL CORRIGIDA ---
                const realHC = s.users.size || 0;
                
                // IMPORTANTE:
                // Para a linha "Total de Assistentes", mostramos o REAL (sysHC/realHC).
                // Para cálculos de MÉDIA (isCalc=true), usamos o MANUAL (HF) se estiver na coluna total.
                const hcParaCalculo = (i === 99) ? HF : (realHC || 1); 

                let val = 0; 
                if (!isCalc) { 
                    if (label.includes('Assistentes')) {
                        // FIX: Na linha VISUAL de assistentes, sempre mostra o REAL.
                        val = (i === 99) ? sysHC : realHC;
                    } else {
                        val = getter(s); 
                    }
                } else { 
                    // Nos cálculos matemáticos, usa a base manual (HF).
                    val = getter(s, diasCal, hcParaCalculo); 
                }

                let txt = val ? Math.round(val).toLocaleString() : '-';
                
                // Destaque visual se o número exibido for diferente da base de cálculo
                let extraStyle = '';
                if (!isCalc && label.includes('Assistentes') && i === 99 && sysHC !== HF) {
                    txt += `<span class="block text-[9px] text-amber-500 font-normal mt-1" title="Base para cálculo das médias">Base Calc: ${HF}</span>`;
                }

                const cellClass = i === 99 ? `px-6 py-4 text-center bg-slate-50 border-l border-slate-100 font-bold ${colorInfo ? colorInfo.replace('text-', 'text-') : 'text-slate-700'}` : `px-4 py-4 text-center text-slate-500 font-medium`;
                tr += `<td class="${cellClass}">${txt}</td>`;
            });
            return tr + '</tr>';
        };
        
        // Linhas da Tabela
        h += mkRow('Total de Assistentes', 'fas fa-users', 'text-indigo-500', s => s.users.size);
        h += mkRow('Total Dias Úteis / Trabalhado', 'fas fa-calendar-check', 'text-cyan-500', (s) => s.diasUteis);
        h += mkRow('Total de Documentos FIFO', 'fas fa-clock', 'text-slate-400', s => s.fifo);
        h += mkRow('Total de Documentos G. Parcial', 'fas fa-adjust', 'text-slate-400', s => s.gp);
        h += mkRow('Total de Documentos G. Total', 'fas fa-check-double', 'text-slate-400', s => s.gt);
        h += mkRow('Total de Documentos Perfil FC', 'fas fa-id-badge', 'text-slate-400', s => s.fc);
        h += mkRow('Total de Documentos Validados', 'fas fa-layer-group', 'text-blue-600', s => s.qty, false, true);
        
        // Linhas de Média (Calculadas com HF no Total)
        h += mkRow('Total Validação Diária (Dias Úteis)', 'fas fa-chart-line', 'text-emerald-600', (s, d) => d > 0 ? s.qty / d : 0, true);
        h += mkRow('Média Validação Diária (Todas)', 'fas fa-user-friends', 'text-teal-600', (s, d, a) => (d > 0 && a > 0) ? s.qty / d / a : 0, true);
        h += mkRow(`Média Validação Diária (Por Assistentes)`, 'fas fa-user-tag', 'text-amber-600', (s, d, a) => (d > 0 && a > 0) ? s.qty / d / a : 0, true);
        
        tbody.innerHTML = h;
        
        const tot = st[99]; 
        const dTot = tot.diasUteis || 1; 
        const setSafe = (id, v) => { const el = document.getElementById(id); if(el) el.innerHTML = v; };
        
        setSafe('cons-p-total', tot.qty.toLocaleString()); 
        setSafe('cons-p-media-time', Math.round(tot.qty / dTot).toLocaleString()); 
        setSafe('cons-p-media-ind', Math.round(tot.qty / dTot / HF).toLocaleString());
        
        // --- ATUALIZAÇÃO DO CARD DE HEADCOUNT ---
        // Agora mostra o REAL como destaque, e a BASE MANUAL como detalhe secundário se for diferente.
        
        let cardHTML = '';
        const somaCheck = countCLT + countPJ + countOutros; // 23

        if (HF !== sysHC) {
            // Se houver diferença (Ex: Manual 13, Real 23), mostra o REAL com aviso.
            cardHTML = `<div class="flex flex-col items-center">
                            <span class="text-3xl font-black text-slate-800">${somaCheck}</span>
                            <span class="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded mt-1" title="Valor usado para dividir a meta">Base Meta: ${HF}</span>
                        </div>`;
        } else {
            // Se forem iguais (ou padrão), mostra normal
            cardHTML = `<span class="text-3xl font-black text-slate-800">${somaCheck}</span>`;
        }
        
        // Detalhe CLT/PJ
        cardHTML += `<div class="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 w-full justify-between">
                        <div class="flex flex-col items-center">
                            <span class="text-[9px] font-bold text-slate-400 uppercase">CLT</span>
                            <span class="text-sm font-black text-blue-600">${countCLT}</span>
                        </div>
                        <div class="w-px h-6 bg-slate-100"></div>
                        <div class="flex flex-col items-center">
                            <span class="text-[9px] font-bold text-slate-400 uppercase">PJ</span>
                            <span class="text-sm font-black text-indigo-600">${countPJ}</span>
                        </div>
                        ${countOutros > 0 ? `<div class="w-px h-6 bg-slate-100"></div><div class="flex flex-col items-center"><span class="text-[9px] font-bold text-slate-400 uppercase">Out</span><span class="text-sm font-black text-slate-500">${countOutros}</span></div>` : ''}
                     </div>`;

        setSafe('cons-p-headcount', cardHTML);
        
        const elLblBase = document.getElementById('cons-lbl-base-avg');
        if(elLblBase) elLblBase.innerText = HF;
    },
    
    newStats: function() { 
        return { users: new Set(), dates: new Set(), diasUteis: 0, qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0 }; 
    }
};
Produtividade.Consolidado = {
    initialized: false,
    ultimoCache: { key: null, data: null },
    baseManualHC: 0,
    dadosCalculados: null, 

    init: async function() { 
        if(!this.initialized) { 
            this.initialized = true; 
        } 
        this.togglePeriodo();
    },

    togglePeriodo: function() {
        const t = document.getElementById('cons-period-type').value;
        const selQ = document.getElementById('cons-select-quarter');
        const selS = document.getElementById('cons-select-semester');
        const dateInput = document.getElementById('global-date');
        
        if(selQ) selQ.classList.add('hidden');
        if(selS) selS.classList.add('hidden');

        if (t === 'trimestre' && selQ) {
            selQ.classList.remove('hidden');
            if(dateInput && dateInput.value) {
                const m = parseInt(dateInput.value.split('-')[1]);
                selQ.value = Math.ceil(m / 3);
            }
        } 
        else if (t === 'semestre' && selS) {
            selS.classList.remove('hidden');
            if(dateInput && dateInput.value) {
                const m = parseInt(dateInput.value.split('-')[1]);
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
        const dateInput = document.getElementById('global-date');
        
        let val = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        let [ano, mes, dia] = val.split('-').map(Number);
        const sAno = String(ano); const sMes = String(mes).padStart(2, '0');
        
        let s, e;
        
        if (t === 'dia') { 
            s = `${sAno}-${sMes}-01`; e = `${sAno}-${sMes}-${new Date(ano, mes, 0).getDate()}`; 
        } else if (t === 'mes') { 
            s = `${sAno}-${sMes}-01`; e = `${sAno}-${sMes}-${new Date(ano, mes, 0).getDate()}`; 
        } else if (t === 'trimestre') { 
            const selQ = document.getElementById('cons-select-quarter');
            const trim = selQ ? parseInt(selQ.value) : Math.ceil(mes / 3); 
            const mStart = ((trim-1)*3)+1; 
            s = `${sAno}-${String(mStart).padStart(2,'0')}-01`; 
            e = `${sAno}-${String(mStart+2).padStart(2,'0')}-${new Date(ano, mStart+2, 0).getDate()}`; 
        } else if (t === 'semestre') { 
            const selS = document.getElementById('cons-select-semester');
            const sem = selS ? parseInt(selS.value) : (mes <= 6 ? 1 : 2); 
            s = sem === 1 ? `${sAno}-01-01` : `${sAno}-07-01`; 
            e = sem === 1 ? `${sAno}-06-30` : `${sAno}-12-31`; 
        } else { 
            s = `${sAno}-01-01`; e = `${sAno}-12-31`; 
        }

        const cacheKey = `${t}_${s}_${e}`;
        if (!forcar && this.ultimoCache.key === cacheKey && this.ultimoCache.data) {
            this.processarEExibir(this.ultimoCache.data, t, mes, ano);
            return;
        }

        if(tbody) tbody.innerHTML = '<tr><td colspan="15" class="text-center py-10 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</td></tr>';

        try {
            const { data: rawData, error } = await Sistema.supabase
                .from('producao')
                .select('usuario_id, data_referencia, quantidade, fifo, gradual_total, gradual_parcial, perfil_fc')
                .gte('data_referencia', s)
                .lte('data_referencia', e);
                
            if(error) throw error;
            
            const usuariosUnicos = new Set(rawData.map(r => r.usuario_id)).size;
            if (this.baseManualHC === 0) this.baseManualHC = usuariosUnicos || 1;
            
            this.ultimoCache = { key: cacheKey, data: rawData, tipo: t, mes: mes, ano: ano };
            this.processarEExibir(rawData, t, mes, ano);
            
        } catch (e) { 
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    processarDados: function(rawData, t, currentMonth, currentYear) {
        const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        let cols = []; 
        let datesMap = {}; 

        if (t === 'dia') { 
            const lastDay = new Date(currentYear, currentMonth, 0).getDate();
            for(let d=1; d<=lastDay; d++) {
                cols.push(String(d).padStart(2,'0'));
                datesMap[d] = { 
                    ini: `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
                    fim: `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                };
            }
        } else if (t === 'mes') { 
            const semanas = Produtividade.Geral.getSemanasDoMes ? Produtividade.Geral.getSemanasDoMes(currentYear, currentMonth) : [];
            semanas.forEach((s, i) => {
                cols.push(`Sem ${i+1}`);
                datesMap[i+1] = { ini: s.inicio, fim: s.fim };
            });
        } else if (t === 'trimestre') {
            const selQ = document.getElementById('cons-select-quarter');
            const trim = selQ ? parseInt(selQ.value) : Math.ceil(currentMonth / 3);
            const idxStart = (trim - 1) * 3;
            cols = [mesesNomes[idxStart], mesesNomes[idxStart+1], mesesNomes[idxStart+2]];
            for(let i=0; i<3; i++) {
                const m = idxStart + i + 1;
                datesMap[i+1] = {
                    ini: `${currentYear}-${String(m).padStart(2,'0')}-01`,
                    fim: `${currentYear}-${String(m).padStart(2,'0')}-${new Date(currentYear, m, 0).getDate()}`
                };
            }
        } else if (t === 'semestre') {
            const selS = document.getElementById('cons-select-semester');
            const sem = selS ? parseInt(selS.value) : (currentMonth <= 6 ? 1 : 2);
            const idxStart = (sem - 1) * 6;
            cols = mesesNomes.slice(idxStart, idxStart + 6);
            for(let i=0; i<6; i++) {
                const m = idxStart + i + 1;
                datesMap[i+1] = {
                    ini: `${currentYear}-${String(m).padStart(2,'0')}-01`,
                    fim: `${currentYear}-${String(m).padStart(2,'0')}-${new Date(currentYear, m, 0).getDate()}`
                };
            }
        } else { 
            cols = mesesNomes; 
            for(let i=0; i<12; i++) {
                const m = i + 1;
                datesMap[i+1] = {
                    ini: `${currentYear}-${String(m).padStart(2,'0')}-01`,
                    fim: `${currentYear}-${String(m).padStart(2,'0')}-${new Date(currentYear, m, 0).getDate()}`
                };
            }
        }

        const numCols = cols.length;
        let st = {}; for(let i=1; i<=numCols; i++) st[i] = this.newStats(); st[99] = this.newStats();

        if(rawData) {
            rawData.forEach(r => {
                const sys = Number(r.quantidade) || 0;
                let b = 1; 

                if (t === 'dia') { 
                    b = parseInt(r.data_referencia.split('-')[2]); 
                } else if (t === 'mes') { 
                    for(let k=1; k<=numCols; k++) {
                        if(r.data_referencia >= datesMap[k].ini && r.data_referencia <= datesMap[k].fim) { b = k; break; }
                    }
                } else { 
                    const mData = parseInt(r.data_referencia.split('-')[1]);
                    for(let k=1; k<=numCols; k++) {
                        const mIni = parseInt(datesMap[k].ini.split('-')[1]);
                        if(mData === mIni) { b = k; break; }
                    }
                }

                if(b >= 1 && b <= numCols) {
                    const populate = (k) => {
                        const x = st[k];
                        x.users.add(r.usuario_id); 
                        x.dates.add(r.data_referencia);
                        x.qty += sys; 
                        x.fifo += (Number(r.fifo)||0); 
                        x.gt += (Number(r.gradual_total)||0); 
                        x.gp += (Number(r.gradual_parcial)||0); 
                        x.fc += (Number(r.perfil_fc)||0);
                    };
                    populate(b);
                    populate(99);
                }
            });
        }

        for(let i=1; i<=numCols; i++) {
            st[i].diasUteis = datesMap[i] ? this.calcularDiasUteisCalendario(datesMap[i].ini, datesMap[i].fim) : 0;
        }
        st[99].diasUteis = 0;
        for(let i=1; i<=numCols; i++) st[99].diasUteis += st[i].diasUteis;

        return { cols, st, numCols, datesMap };
    },

    processarEExibir: function(rawData, t, mes, ano) {
        this.dadosCalculados = this.processarDados(rawData, t, mes, ano);
        this.renderizar(this.dadosCalculados);
    },

    renderizar: function({ cols, st, numCols }) {
        const tbody = document.getElementById('cons-table-body');
        const hRow = document.getElementById('cons-table-header');
        
        if(hRow) hRow.innerHTML = `
            <tr class="bg-slate-50 border-b border-slate-200">
                <th class="px-6 py-4 sticky left-0 bg-slate-50 z-20 border-r border-slate-200 text-left min-w-[250px]">
                    <span class="text-xs font-black text-slate-400 uppercase tracking-widest">Indicador</span>
                </th>` + 
            cols.map(c => `<th class="px-4 py-4 text-center border-l border-slate-200 min-w-[100px]"><span class="text-xs font-bold text-slate-600 uppercase">${c}</span></th>`).join('') + 
            `<th class="px-6 py-4 text-center bg-blue-50 border-l border-blue-100 min-w-[120px]">
                <span class="text-xs font-black text-blue-600 uppercase tracking-widest">TOTAL</span>
            </th></tr>`;

        let h = ''; 
        const idxs = [...Array(numCols).keys()].map(i => i + 1); idxs.push(99);

        const mkRow = (label, icon, colorInfo, getter, isCalc=false, isBold=false) => {
            const rowBg = isBold ? 'bg-slate-50/50' : 'hover:bg-slate-50 transition-colors';
            const iconColor = colorInfo || 'text-slate-400';
            const textColor = isBold ? 'text-slate-800' : 'text-slate-600';
            
            let tr = `<tr class="${rowBg} border-b border-slate-100 last:border-0 group">
                <td class="px-6 py-3 sticky left-0 bg-white z-10 border-r border-slate-200 group-hover:bg-slate-50 transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100">
                            <i class="${icon} ${iconColor} text-sm"></i>
                        </div>
                        <span class="${textColor} ${isBold ? 'font-black' : 'font-medium'} text-xs uppercase tracking-wide">${label}</span>
                    </div>
                </td>`;
            
            idxs.forEach(i => {
                const s = st[i]; 
                const HF = this.baseManualHC > 0 ? this.baseManualHC : (s.users.size || 1); 
                let val = isCalc ? getter(s, s.diasUteis, HF) : getter(s);
                if (val instanceof Set) val = val.size;
                
                const txt = (val !== undefined && val !== null && !isNaN(val)) ? Math.round(val).toLocaleString('pt-BR') : '-';
                
                let cellClass = `px-4 py-3 text-center text-xs border-l border-slate-100 `;
                if (i === 99) cellClass += `bg-blue-50/30 font-bold ${colorInfo ? colorInfo : 'text-slate-700'}`;
                else cellClass += `text-slate-500 font-medium`;

                tr += `<td class="${cellClass}">${txt}</td>`;
            });
            return tr + '</tr>';
        };

        h += mkRow('Base Assistentes (HC)', 'fas fa-users-cog', 'text-indigo-400', (s, d, HF) => HF, true);
        h += mkRow('Dias Úteis', 'fas fa-calendar-day', 'text-cyan-500', (s) => s.diasUteis);
        h += mkRow('Total FIFO', 'fas fa-clock', 'text-slate-400', s => s.fifo);
        h += mkRow('Total G. Parcial', 'fas fa-adjust', 'text-slate-400', s => s.gp);
        h += mkRow('Total G. Total', 'fas fa-check-double', 'text-slate-400', s => s.gt);
        h += mkRow('Total Perfil FC', 'fas fa-id-badge', 'text-slate-400', s => s.fc);
        h += mkRow('Total Documentos Validados', 'fas fa-layer-group', 'text-blue-600', s => s.qty, false, true);
        h += mkRow('Total Validação Diária (Dias Úteis)', 'fas fa-chart-line', 'text-emerald-600', (s, d) => d > 0 ? s.qty / d : 0, true);
        h += mkRow('Média Validação (Todas Assistentes)', 'fas fa-user-friends', 'text-teal-600', (s, d, HF) => HF > 0 ? s.qty / HF : 0, true);
        h += mkRow('Média Validação Diária (Por Assist.)', 'fas fa-user-tag', 'text-amber-600', (s, d, HF) => (d > 0 && HF > 0) ? s.qty / HF / d : 0, true);
        
        tbody.innerHTML = h;
    },

    newStats: function() { 
        return { 
            users: new Set(), dates: new Set(), diasUteis: 0,
            qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0
        }; 
    }
};
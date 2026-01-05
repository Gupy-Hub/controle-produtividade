const Cons = {
    initialized: false,
    ultimoCache: { key: null, data: null },
    basesManuais: {}, // Armazena as bases manuais (ex: {1: 17, 2: 13, 99: 17})

    init: async function() { 
        if(!this.initialized) { 
            this.initialized = true; 
        } 
        this.togglePeriodo();
    },

    togglePeriodo: function() {
        // Reseta as bases manuais ao mudar o tipo de visualização
        this.basesManuais = {};

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
    
    // Chamado quando a gestora altera o input de assistentes na tabela
    atualizarBaseManual: function(colIndex, valor) {
        this.basesManuais[colIndex] = Number(valor);
        
        // Re-renderiza usando os dados em cache para ser instantâneo
        if (this.ultimoCache.data) {
            const t = document.getElementById('cons-period-type').value;
            let el = document.getElementById('global-date');
            let val = el ? el.value : new Date().toISOString().split('T')[0];
            let dia, mes, ano;
            if (val.includes('-')) { [ano, mes, dia] = val.split('-').map(Number); }
            else { const now = new Date(); mes = now.getMonth() + 1; ano = now.getFullYear(); }

            this.renderizar(this.ultimoCache.data, t, 17, mes, ano);
        }
    },
    
    carregar: async function(forcar = false) {
        const tbody = document.getElementById('cons-table-body'); 
        const t = document.getElementById('cons-period-type').value; 
        
        if (!Sistema.Dados.inicializado) await Sistema.Dados.inicializar();

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

        const HF = 17; // Valor padrão inicial de fallback
        const cacheKey = `${t}_${s}_${e}`;

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

    renderizar: function(rawData, t, HF_Fallback, currentMonth, currentYear) {
        const tbody = document.getElementById('cons-table-body');
        if (!tbody) return;

        const tableWrapper = document.getElementById('cons-table-wrapper');
        
        // --- ALTERAÇÃO: Adicionado || t === 'ano_mes' para subir o scroll ---
        if (t === 'dia' || t === 'ano_mes') {
            tableWrapper.classList.add('scroll-top-wrapper');
        } else {
            tableWrapper.classList.remove('scroll-top-wrapper');
        }

        const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        let cols = []; 
        
        // Definição das colunas
        if (t === 'dia') { 
            const lastDay = new Date(currentYear, currentMonth, 0).getDate();
            for(let d=1; d<=lastDay; d++) cols.push(String(d).padStart(2,'0'));
        } 
        else if (t === 'mes') { cols = ['Semana 1','Semana 2','Semana 3','Semana 4','Semana 5']; } 
        else if (t === 'trimestre') {
            const selQ = document.getElementById('cons-select-quarter');
            const trim = selQ ? parseInt(selQ.value) : Math.ceil(currentMonth / 3);
            const idxStart = (trim - 1) * 3;
            cols = [mesesNomes[idxStart], mesesNomes[idxStart+1], mesesNomes[idxStart+2]];
        } else if (t === 'semestre') {
            const selS = document.getElementById('cons-select-semester');
            const sem = selS ? parseInt(selS.value) : (currentMonth <= 6 ? 1 : 2);
            const idxStart = (sem - 1) * 6;
            cols = mesesNomes.slice(idxStart, idxStart + 6);
        } else if (t === 'ano_trim') {
            cols = ['1º Trim', '2º Trim', '3º Trim', '4º Trim'];
        } else { 
            cols = mesesNomes; 
        }
        
        const numCols = cols.length; 
        
        // Inicializa inputs manuais se não existirem
        for(let i=1; i<=numCols; i++) {
            if (this.basesManuais[i] === undefined) this.basesManuais[i] = 17;
        }
        if (this.basesManuais[99] === undefined) this.basesManuais[99] = 17;

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

        // --- CÁLCULO SIMPLIFICADO DE DIAS ÚTEIS (DIAS COM DADOS) ---
        for(let i=1; i<=numCols; i++) {
            st[i].diasUteis = st[i].dates.size;
        }
        st[99].diasUteis = st[99].dates.size;

        const hRow = document.getElementById('cons-table-header'); 
        
        // Geração dos Cabeçalhos com INPUT
        let headerHTML = `<th class="px-6 py-4 sticky left-0 bg-white z-20 border-b-2 border-slate-100 text-left min-w-[200px]"><span class="text-xs font-black text-slate-400 uppercase tracking-widest">Indicador</span></th>`;
        
        cols.forEach((c, idx) => {
            const colIndex = idx + 1;
            const valorInput = this.basesManuais[colIndex];
            headerHTML += `
            <th class="px-4 py-2 text-center border-b-2 border-slate-100 min-w-[100px]">
                <div class="flex flex-col items-center gap-1">
                    <span class="text-xs font-bold text-slate-500 uppercase">${c}</span>
                    <div class="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200" title="Base de Assistentes para cálculo de meta individual">
                        <i class="fas fa-users text-[9px] text-slate-400"></i>
                        <input type="number" 
                            value="${valorInput}" 
                            min="1" 
                            onchange="Cons.atualizarBaseManual(${colIndex}, this.value)"
                            class="w-10 bg-transparent text-center text-xs font-bold text-blue-600 outline-none border-b border-transparent focus:border-blue-400 p-0"
                        >
                    </div>
                </div>
            </th>`;
        });

        // Coluna Total
        const valorTotalInput = this.basesManuais[99];
        headerHTML += `
        <th class="px-6 py-2 text-center bg-slate-50 border-b-2 border-slate-100 border-l border-slate-100 min-w-[120px]">
            <div class="flex flex-col items-center gap-1">
                <span class="text-xs font-black text-blue-600 uppercase tracking-widest">TOTAL</span>
                <div class="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-blue-200 shadow-sm">
                    <i class="fas fa-users text-[9px] text-blue-400"></i>
                    <input type="number" 
                        value="${valorTotalInput}" 
                        min="1" 
                        onchange="Cons.atualizarBaseManual(99, this.value)"
                        class="w-10 bg-transparent text-center text-xs font-bold text-blue-700 outline-none border-b border-transparent focus:border-blue-400 p-0"
                    >
                </div>
            </div>
        </th>`;
        
        if(hRow) hRow.innerHTML = headerHTML;
        
        let h = ''; 
        const idxs = [...Array(numCols).keys()].map(i => i + 1); idxs.push(99);

        // Função geradora de linhas
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
                const diasCal = s.diasUteis || 1; // Agora é puramente baseado em dados encontrados
                const baseManual = this.basesManuais[i] || 17; 

                let val = getter(s, diasCal, baseManual);
                let txt = (val !== null && val !== undefined) ? Math.round(val).toLocaleString() : '-';
                
                const cellClass = i === 99 ? `px-6 py-4 text-center bg-slate-50 border-l border-slate-100 font-bold ${colorInfo ? colorInfo.replace('text-', 'text-') : 'text-slate-700'}` : `px-4 py-4 text-center text-slate-500 font-medium`;
                tr += `<td class="${cellClass}">${txt}</td>`;
            });
            return tr + '</tr>';
        };
        
        // --- LINHAS DA TABELA ---
        h += mkRow('Assistentes (Real)', 'fas fa-id-card-alt', 'text-indigo-500', (s) => s.users.size);
        h += mkRow('Dias com Validação', 'fas fa-calendar-day', 'text-cyan-500', (s) => s.diasUteis); 
        h += mkRow('Total de Documentos FIFO', 'fas fa-clock', 'text-slate-400', s => s.fifo);
        h += mkRow('Total de Documentos G. Parcial', 'fas fa-adjust', 'text-slate-400', s => s.gp);
        h += mkRow('Total de Documentos G. Total', 'fas fa-check-double', 'text-slate-400', s => s.gt);
        h += mkRow('Total de Documentos Perfil FC', 'fas fa-id-badge', 'text-slate-400', s => s.fc);
        h += mkRow('Total de Documentos Validados', 'fas fa-layer-group', 'text-blue-600', s => s.qty, false, true);
        
        // Médias (Usando a Base Manual dos Inputs)
        h += mkRow('Média Validação Diária (Todas)', 'fas fa-users', 'text-emerald-600', 
            (s, dias, base) => dias > 0 ? s.qty / dias : 0, 
            true
        );

        h += mkRow('Média Validação Diária (Por Assistentes)', 'fas fa-user', 'text-amber-600', 
            (s, dias, base) => (dias > 0 && base > 0) ? (s.qty / dias) / base : 0, 
            true
        );
        
        tbody.innerHTML = h;
        
        // Atualiza Cards Superiores
        const tot = st[99]; 
        const dTot = tot.diasUteis || 1; 
        const baseTot = this.basesManuais[99];
        
        const setSafe = (id, v) => { const el = document.getElementById(id); if(el) el.innerHTML = v; };
        
        setSafe('cons-p-total', tot.qty.toLocaleString()); 
        setSafe('cons-p-media-time', Math.round(tot.qty / dTot).toLocaleString()); 
        setSafe('cons-p-media-ind', Math.round(tot.qty / dTot / baseTot).toLocaleString());
        
        setSafe('cons-p-headcount', `
            <div class="flex flex-col items-start">
                <div><span class="text-xs text-slate-400 font-bold uppercase">Real:</span> <span class="text-xl font-black text-slate-700">${tot.users.size}</span></div>
                <div><span class="text-xs text-blue-400 font-bold uppercase">Meta:</span> <span class="text-xl font-black text-blue-600">${baseTot}</span></div>
            </div>
        `);
        
        const elLblBase = document.getElementById('cons-lbl-base-avg');
        if(elLblBase) elLblBase.innerText = baseTot;
    },
    
    newStats: function() { 
        return { users: new Set(), dates: new Set(), diasUteis: 0, qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0 }; 
    }
};
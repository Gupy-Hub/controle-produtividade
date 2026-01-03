const Cons = {
    initialized: false,
    ultimoCache: { key: null, data: null },

    init: async function() { 
        if(!this.initialized) { 
            this.initialized = true; 
        } 
        setTimeout(() => this.carregar(false), 50); 
    },

    mudarBase: function(novoValor) {
        if(!novoValor) return;
        let el = document.getElementById('global-date');
        let val = el ? el.value : new Date().toISOString().split('T')[0];
        
        Sistema.Dados.definirBaseHC(val, novoValor);
        this.carregar(true); 
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

        // Sincroniza input visual
        const inputHC = document.getElementById('cons-input-hc');
        if(inputHC) {
            const baseDoMes = Sistema.Dados.obterBaseHC(val);
            inputHC.value = baseDoMes;
        }

        const sAno = String(ano); const sMes = String(mes).padStart(2, '0'); const sDia = String(dia).padStart(2, '0');
        
        // Definição dos Intervalos de Data
        let s, e;
        
        // CORREÇÃO: Visão Diária agora pega o MÊS INTEIRO para explodir em dias
        if (t === 'dia' || t === 'mes') { 
            s = `${sAno}-${sMes}-01`; 
            e = `${sAno}-${sMes}-${new Date(ano, mes, 0).getDate()}`; 
        }
        else if (t === 'trimestre') { 
            const trim = Math.ceil(mes / 3); 
            const mStart = ((trim-1)*3)+1; 
            s = `${sAno}-${String(mStart).padStart(2,'0')}-01`; 
            e = `${sAno}-${String(mStart+2).padStart(2,'0')}-${new Date(ano, mStart+2, 0).getDate()}`; 
        }
        else if (t === 'semestre') { 
            const sem = Math.ceil(mes / 6); 
            s = sem === 1 ? `${sAno}-01-01` : `${sAno}-07-01`; 
            e = sem === 1 ? `${sAno}-06-30` : `${sAno}-12-31`; 
        } 
        else { // ano_mes e ano_trim
            s = `${sAno}-01-01`; 
            e = `${sAno}-12-31`; 
        }

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

        const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        let cols = []; 
        
        // --- GERAÇÃO DAS COLUNAS ---
        if (t === 'dia') { 
            // Gera colunas de 01 a 31 (ou ultimo dia do mes)
            const lastDay = new Date(currentYear, currentMonth, 0).getDate();
            for(let d=1; d<=lastDay; d++) cols.push(String(d).padStart(2,'0'));
        } 
        else if (t === 'mes') { cols = ['Semana 1','Semana 2','Semana 3','Semana 4','Semana 5']; } 
        else if (t === 'trimestre') {
            const trim = Math.ceil(currentMonth / 3);
            const idxStart = (trim - 1) * 3;
            cols = [mesesNomes[idxStart], mesesNomes[idxStart+1], mesesNomes[idxStart+2]];
        } else if (t === 'semestre') {
            const sem = Math.ceil(currentMonth / 6);
            const idxStart = (sem - 1) * 6;
            cols = mesesNomes.slice(idxStart, idxStart + 6);
        } else if (t === 'ano_trim') {
            cols = ['1º Trim', '2º Trim', '3º Trim', '4º Trim'];
        } else { 
            cols = mesesNomes; 
        }
        
        const numCols = cols.length; 
        let st = {}; for(let i=1; i<=numCols; i++) st[i] = this.newStats(); st[99] = this.newStats();
        
        if(rawData) {
            rawData.forEach(r => {
                const user = Sistema.Dados.usuariosCache[r.usuario_id];
                if(!user || user.funcao !== 'Assistente') return;

                const nome = user.nome;
                const sys = Number(r.quantidade) || 0;
                
                let b = 1; 
                const parts = r.data_referencia.split('-'); 
                const dt = new Date(parts[0], parts[1]-1, parts[2]);
                const mIdx = dt.getMonth(); 
                const dDia = dt.getDate();

                // Lógica de agrupamento (Bucket)
                if (t === 'dia') {
                    b = dDia; // Bucket é o dia do mês (1 a 31)
                }
                else if (t === 'mes') { 
                    const firstDay = new Date(dt.getFullYear(), dt.getMonth(), 1).getDay(); 
                    b = Math.ceil((dt.getDate() + firstDay) / 7); 
                } 
                else if (t === 'trimestre') { b = (mIdx % 3) + 1; } 
                else if (t === 'semestre') { b = (mIdx % 6) + 1; } 
                else if (t === 'ano_trim') { b = Math.ceil((mIdx + 1) / 3); }
                else if (t === 'ano_mes') { b = mIdx + 1; }
                
                if(b > numCols) b = numCols;

                const populate = (k) => {
                    if(!st[k]) return;
                    const x = st[k];
                    x.users.add(nome); 
                    x.dates.add(r.data_referencia); // Adiciona data única para contar dias úteis
                    
                    x.qty += sys; 
                    x.fifo += (Number(r.fifo)||0); 
                    x.gt += (Number(r.gradual_total)||0); 
                    x.gp += (Number(r.gradual_parcial)||0); 
                    x.fc += (Number(r.perfil_fc)||0);
                };
                populate(b);
                populate(99); // Totalizador
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
                
                // CORREÇÃO: Dias Úteis agora é a contagem de datas únicas com produção (Calendário)
                // Se for a coluna de um dia específico (visão diária), size será 1 (se houve trabalho) ou 0.
                // Se for Total, size será o total de dias distintos no mês (ex: 22).
                const diasReais = s.dates.size; 
                
                const ativos = s.users.size || 1; 
                let val = 0; 
                
                if (!isCalc) { 
                    val = getter(s); 
                    if (val instanceof Set) val = val.size; 
                } else { 
                    val = getter(s, diasReais, ativos); 
                }
                const txt = val ? Math.round(val).toLocaleString() : '-';
                const cellClass = i === 99 ? `px-6 py-4 text-center bg-slate-50 border-l border-slate-100 font-bold ${colorInfo ? colorInfo.replace('text-', 'text-') : 'text-slate-700'}` : `px-4 py-4 text-center text-slate-500 font-medium`;
                tr += `<td class="${cellClass}">${txt}</td>`;
            });
            return tr + '</tr>';
        };
        
        // 1. Total de assistentes
        h += mkRow('Total de Assistentes', 'fas fa-users', 'text-indigo-500', s => s.users);
        
        // 2. Total de dias úteis / trabalhado (Agora conta dias de calendário únicos)
        h += mkRow('Total Dias Úteis / Trabalhado', 'fas fa-calendar-check', 'text-cyan-500', s => s.dates);
        
        // 3. Total de documentos Fifo
        h += mkRow('Total de Documentos FIFO', 'fas fa-clock', 'text-slate-400', s => s.fifo);
        
        // 4. Total de documentos Gradual Parcial
        h += mkRow('Total de Documentos G. Parcial', 'fas fa-adjust', 'text-slate-400', s => s.gp);
        
        // 5. Total de documentos Gradual Total
        h += mkRow('Total de Documentos G. Total', 'fas fa-check-double', 'text-slate-400', s => s.gt);
        
        // 6. Total de documentos Perfil Fc
        h += mkRow('Total de Documentos Perfil FC', 'fas fa-id-badge', 'text-slate-400', s => s.fc);
        
        // 7. Total de documentos validados (DESTACADO)
        h += mkRow('Total de Documentos Validados', 'fas fa-layer-group', 'text-blue-600', s => s.qty, false, true);
        
        // 8. Total validação diária (Dias uteis) 
        // Lógica: Produção Total / Dias Úteis do Período (Média Absoluta da Equipe por Dia)
        h += mkRow('Total Validação Diária (Dias Úteis)', 'fas fa-chart-line', 'text-emerald-600', (s, d) => d > 0 ? s.qty / d : 0, true);
        
        // 9. Média validação diária (Todas assistentes)
        // Lógica: (Produção Total / Dias Úteis) / Total de Pessoas Reais Ativas
        // Isso mostra quanto CADA pessoa real produziu por dia em média
        h += mkRow('Média Validação Diária (Todas)', 'fas fa-user-friends', 'text-teal-600', (s, d, a) => (d > 0 && a > 0) ? s.qty / d / a : 0, true);
        
        // 10. Média validação diária (Por Assistentes)
        // Lógica: (Produção Total / Dias Úteis) / Base HC Configurada (HF)
        // Isso mostra a média considerando o quadro esperado (Base) e não o real
        h += mkRow(`Média Validação Diária (Por Assistentes)`, 'fas fa-user-tag', 'text-amber-600', (s, d) => d > 0 ? s.qty / d / HF : 0, true);
        
        tbody.innerHTML = h;
        
        // Atualiza Cards Superiores
        const tot = st[99]; 
        const dTot = tot.dates.size || 1; // Dias Únicos Totais
        const setSafe = (id, v) => { const el = document.getElementById(id); if(el) el.innerText = v; };
        
        setSafe('cons-p-total', tot.qty.toLocaleString()); 
        
        // Média do Time = Produção / Dias
        setSafe('cons-p-media-time', Math.round(tot.qty / dTot).toLocaleString()); 
        
        // Média Ind = (Produção / Dias) / Base HC
        setSafe('cons-p-media-ind', Math.round(tot.qty / dTot / HF).toLocaleString());
        
        // Card Headcount mostra as Ativas Reais
        setSafe('cons-p-headcount', tot.users.size); 
        
        // Badge mostra a Base Configurada
        const elLblBase = document.getElementById('cons-lbl-base-avg');
        if(elLblBase) elLblBase.innerText = HF;
        const elBadge = document.getElementById('cons-badge-base');
        if (elBadge) elBadge.innerText = `Base ${HF}`;
    },
    
    newStats: function() { 
        return { 
            users: new Set(), 
            dates: new Set(), // Set de datas únicas para contagem correta de dias úteis
            qty: 0, fifo: 0, gt: 0, gp: 0, fc: 0
        }; 
    }
};
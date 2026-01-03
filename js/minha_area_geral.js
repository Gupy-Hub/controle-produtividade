const MA_Diario = {
    normalizarDadosPorNome: function(rawData) {
        const agrupado = {};
        rawData.forEach(item => {
            if (MA_Main.userRoles[item.usuario_id] !== 'Assistente') return;
            const nome = MA_Main.usersMap[item.usuario_id] || 'Desconhecido';
            const data = item.data_referencia;
            if (!agrupado[data]) agrupado[data] = {};
            if (!agrupado[data][nome]) {
                agrupado[data][nome] = {
                    id_ref: item.id, quantidade: 0, meta_diaria: item.meta_diaria || 650,
                    observacao: item.observacao || '', observacao_gestora: item.observacao_gestora || ''
                };
            }
            agrupado[data][nome].quantidade += item.quantidade;
            if (item.observacao && !agrupado[data][nome].observacao.includes(item.observacao)) agrupado[data][nome].observacao += ` | ${item.observacao}`;
        });
        return agrupado;
    },

    togglePeriodo: function() {
        const type = document.getElementById('diario-period-type').value;
        const q = document.getElementById('diario-select-quarter');
        const s = document.getElementById('diario-select-semester');
        
        if(!q || !s) return;

        q.classList.add('hidden');
        s.classList.add('hidden');
        
        // Sincroniza automaticamente na primeira seleção
        const dt = MA_Main.getDateFromInput();
        const m = dt.getMonth() + 1;

        if(type === 'trimestre') {
            q.classList.remove('hidden');
            if (q.value === '1' && m > 3) { // Pequena lógica para setar padrão
                q.value = Math.ceil(m/3);
            }
        } else if (type === 'semestre') {
            s.classList.remove('hidden');
            if (s.value === '1' && m > 6) {
                s.value = 2;
            }
        }
        
        MA_Main.atualizarDashboard();
    },

    atualizarKPIs: function(dados) {
        const total = dados.reduce((acc, curr) => acc + (curr.quantidade || 0), 0);
        const diasTrabalhados = dados.filter(d => d.quantidade > 0).length || 1; 
        
        let metaTotal = 0;
        if(dados.length > 0) dados.forEach(d => metaTotal += (d.meta_diaria || 650)); else metaTotal = 650 * 22;

        const media = Math.round(total / diasTrabalhados);
        const atingimento = Math.round((total / metaTotal) * 100);

        this.setTxt('kpi-total', total.toLocaleString());
        this.setTxt('kpi-meta-total', metaTotal.toLocaleString());
        this.setTxt('kpi-porcentagem', atingimento + '%');
        this.setTxt('kpi-media-real', media.toLocaleString());
        
        const bar = document.getElementById('bar-progress');
        const icon = document.getElementById('icon-status');
        
        if(bar) bar.style.width = Math.min(atingimento, 100) + '%';
        
        if(icon && bar) {
            if(atingimento>=100) { 
                bar.className="bg-emerald-500 h-full rounded-full"; 
                icon.className="fas fa-check-circle text-emerald-500 text-lg"; 
            } else if(atingimento>=80) { 
                bar.className="bg-amber-400 h-full rounded-full"; 
                icon.className="fas fa-exclamation-circle text-amber-500 text-lg"; 
            } else { 
                bar.className="bg-rose-500 h-full rounded-full"; 
                icon.className="fas fa-times-circle text-rose-500 text-lg"; 
            }
        }
    },

    atualizarTabelaDiaria: function(dados, viewingTime) {
        const tbody = document.getElementById('tabela-diario');
        if (!tbody) return;
        
        if (!dados.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400">Nenhum registo encontrado neste período.</td></tr>'; return; }
        
        let html = '';
        dados.sort((a,b) => new Date(b.data_referencia) - new Date(a.data_referencia));

        dados.forEach(item => {
            const meta = item.meta_diaria || 650; const atingiu = item.quantidade >= meta;
            const badge = atingiu ? '<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border border-emerald-200">Meta Batida</span>' : '<span class="bg-rose-100 text-rose-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border border-rose-200">Abaixo</span>';
            const dFmt = item.data_referencia.split('-').reverse().join('/');
            
            let inputMeta = `<span class="font-bold text-slate-600">${meta}</span>`;
            if(MA_Main.isMgr && !viewingTime && item.id) inputMeta = `<input type="number" value="${meta}" onchange="MA_Diario.atualizarMeta(${item.id}, this.value, ${meta})" class="w-20 text-center border border-slate-200 rounded px-1 py-1 text-xs font-bold bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-blue-200">`;
            
            let obs = item.observacao || '<span class="text-slate-300">-</span>';
            if(item.observacao_gestora) obs += `<div class="mt-1 text-[10px] text-blue-600 bg-blue-50 p-1.5 rounded border border-blue-100"><i class="fas fa-user-shield mr-1"></i>${item.observacao_gestora}</div>`;
            
            html += `<tr class="hover:bg-slate-50 border-b border-slate-50 transition">
                        <td class="px-6 py-4 font-bold text-slate-600">${dFmt}</td>
                        <td class="px-6 py-4 text-center font-black text-blue-600 text-lg">${item.quantidade}</td>
                        <td class="px-6 py-4 text-center">${inputMeta}</td>
                        <td class="px-6 py-4 text-center">${badge}</td>
                        <td class="px-6 py-4 text-xs text-slate-500 max-w-xs break-words">${obs}</td>
                    </tr>`;
        });
        tbody.innerHTML = html;
    },

    atualizarMeta: async function(id, nv, av) { 
        if(nv==av) return; 
        const m = prompt("Motivo da alteração de meta:"); 
        if(!m){ MA_Main.atualizarDashboard(); return;} 
        const obs = `${new Date().toLocaleDateString()} - Alterado ${av}->${nv}: ${m}`; 
        await _supabase.from('producao').update({meta_diaria:nv, observacao_gestora:obs}).eq('id',id); 
        MA_Main.atualizarDashboard(); 
    },

    setTxt: function(id, txt) {
        const el = document.getElementById(id);
        if(el) el.innerText = txt;
    }
};
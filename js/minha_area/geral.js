MinhaArea.Diario = {
    carregar: async function() {
        if (!MinhaArea.user || !MinhaArea.supabase) return;

        const periodo = MinhaArea.getPeriodo();
        const uid = MinhaArea.user.id;
        const tbody = document.getElementById('tabela-diario');

        if(tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</td></tr>';

        this.verificarAcessoHoje();

        try {
            // 1. DADOS PESSOAIS
            const { data: producao, error } = await MinhaArea.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            // 2. DADOS DO TIME
            const { data: producaoTime } = await MinhaArea.supabase
                .from('producao')
                .select('quantidade, fator, usuarios!inner(perfil)')
                .eq('usuarios.perfil', 'assistente') 
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim);

            // 3. METAS
            const { data: metas } = await MinhaArea.supabase
                .from('metas')
                .select('*')
                .eq('usuario_id', uid)
                .order('data_inicio', { ascending: false });

            // PROCESSAMENTO
            const dadosProcessados = producao.map(item => {
                let metaBase = 650;
                if (item.meta_diaria && Number(item.meta_diaria) > 0) metaBase = Number(item.meta_diaria);
                else if (metas && metas.length > 0) {
                    const m = metas.find(meta => meta.data_inicio <= item.data_referencia);
                    if (m) metaBase = Number(m.valor_meta);
                }

                let fator = 1;
                if (item.fator !== null && item.fator !== undefined) fator = Number(item.fator);
                else if (item.fator_multiplicador !== null && item.fator_multiplicador !== undefined) fator = Number(item.fator_multiplicador);

                return {
                    id: item.id,
                    data_referencia: item.data_referencia,
                    quantidade: Number(item.quantidade) || 0,
                    meta_original: metaBase,
                    meta_ajustada: Math.round(metaBase * (fator === 0 ? 0 : fator)),
                    fator: fator,
                    observacao: item.observacao || '',
                    observacao_gestora: item.observacao_gestora || '',
                    justificativa: item.justificativa || ''
                };
            });

            let mediaTime = 0;
            if (producaoTime && producaoTime.length > 0) {
                const totalTime = producaoTime.reduce((acc, curr) => acc + (Number(curr.quantidade)||0), 0);
                const diasTime = producaoTime.reduce((acc, curr) => {
                    const f = curr.fator !== null ? Number(curr.fator) : 1;
                    return acc + (f > 0 ? 1 : 0);
                }, 0);
                mediaTime = diasTime > 0 ? Math.round(totalTime / diasTime) : 0;
            }

            this.atualizarKPIs(dadosProcessados, mediaTime);
            this.atualizarTabelaDiaria(dadosProcessados);

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    atualizarKPIs: function(dados, mediaTime) {
        const totalProd = dados.reduce((acc, curr) => acc + curr.quantidade, 0);
        const totalMeta = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? (curr.meta_original * curr.fator) : 0), 0);
        const diasEfetivos = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? 1 : 0), 0);
        
        const minhaMedia = diasEfetivos > 0 ? Math.round(totalProd / diasEfetivos) : 0;
        const atingimento = totalMeta > 0 ? Math.round((totalProd / totalMeta) * 100) : 0;

        this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-total', Math.round(totalMeta).toLocaleString('pt-BR'));
        this.setTxt('kpi-pct', `${atingimento}%`);
        this.setTxt('kpi-media-real', minhaMedia.toLocaleString('pt-BR'));
        this.setTxt('kpi-media-time', mediaTime.toLocaleString('pt-BR'));
        this.setTxt('kpi-dias', diasEfetivos);
        
        const bar = document.getElementById('bar-progress');
        if(bar) {
            bar.style.width = `${Math.min(atingimento, 100)}%`;
            bar.className = atingimento >= 100 ? "h-full bg-emerald-500 rounded-full" : (atingimento >= 90 ? "h-full bg-blue-500 rounded-full" : "h-full bg-amber-500 rounded-full");
        }

        const compMsg = document.getElementById('kpi-comparativo-msg');
        if(compMsg) {
            if(minhaMedia > mediaTime) compMsg.innerHTML = '<span class="text-emerald-600 font-bold"><i class="fas fa-arrow-up mr-1"></i>Acima da média!</span>';
            else if(minhaMedia < mediaTime) compMsg.innerHTML = '<span class="text-amber-600 font-bold"><i class="fas fa-arrow-down mr-1"></i>Abaixo da média.</span>';
            else compMsg.innerHTML = '<span class="text-blue-600 font-bold">Na média do time.</span>';
        }

        const txtStatus = document.getElementById('kpi-status-text');
        const iconStatus = document.getElementById('icon-status');
        if(txtStatus && iconStatus) {
            if(atingimento >= 100) {
                txtStatus.innerHTML = "<span class='text-emerald-600'>Excelente! Meta batida.</span>";
                iconStatus.className = "fas fa-star text-emerald-500";
            } else if(atingimento >= 85) {
                txtStatus.innerHTML = "<span class='text-blue-600'>Bom desempenho.</span>";
                iconStatus.className = "fas fa-thumbs-up text-blue-500";
            } else {
                txtStatus.innerHTML = "<span class='text-amber-600'>Precisa melhorar.</span>";
                iconStatus.className = "fas fa-exclamation text-amber-500";
            }
        }
    },

    atualizarTabelaDiaria: function(dados) {
        const tbody = document.getElementById('tabela-diario');
        if (!tbody) return;
        
        if (!dados.length) { 
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400">Nenhum registro encontrado.</td></tr>'; 
            return; 
        }
        
        let html = '';
        dados.forEach(item => {
            const fator = item.fator;
            const pct = item.meta_ajustada > 0 ? Math.round((item.quantidade / item.meta_ajustada) * 100) : 0;
            
            let statusBadge = fator === 0 
                ? '<span class="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[10px] font-bold uppercase border border-slate-200">Abonado</span>'
                : `<span class="${pct >= 100 ? 'bg-emerald-100 text-emerald-700' : (pct >= 80 ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700')} px-2 py-1 rounded text-[10px] font-bold border">${pct}%</span>`;

            let obsHtml = '';
            if (item.observacao) obsHtml += `<div class="mb-1 text-slate-700">${item.observacao}</div>`;
            if (item.justificativa) obsHtml += `<div class="text-xs text-slate-500 italic"><i class="fas fa-info-circle mr-1"></i>Just.: ${item.justificativa}</div>`;
            if (item.observacao_gestora) obsHtml += `<div class="mt-1 text-[10px] bg-blue-50 text-blue-700 p-1 rounded border border-blue-100"><i class="fas fa-comment mr-1"></i>Gestão: ${item.observacao_gestora}</div>`;
            if (!obsHtml) obsHtml = '<span class="text-slate-300">-</span>';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition">
                <td class="px-6 py-4 font-bold text-slate-600 text-xs">${item.data_referencia.split('-').reverse().join('/')}</td>
                <td class="px-6 py-4 text-center font-black text-slate-700 text-base">${item.quantidade}</td>
                <td class="px-6 py-4 text-center text-xs text-slate-500">
                    ${item.meta_original} ${fator < 1 ? `<span class="ml-1 text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-bold">x${fator}</span>` : ''}
                </td>
                <td class="px-6 py-4 text-center">${statusBadge}</td>
                <td class="px-6 py-4 text-xs text-slate-600 max-w-sm break-words leading-relaxed">${obsHtml}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    },

    setTxt: function(id, txt) {
        const el = document.getElementById(id);
        if(el) el.innerText = txt;
    },

    verificarAcessoHoje: async function() {
        if (MinhaArea.user && (MinhaArea.user.cargo === 'GESTORA' || MinhaArea.user.cargo === 'AUDITORA')) return;
        const box = document.getElementById('box-confirmacao-leitura');
        const d = new Date(); d.setDate(d.getDate() - 1);
        if(d.getDay() === 0 || d.getDay() === 6) { if(box) box.classList.add('hidden'); return; }
        const { data } = await MinhaArea.supabase.from('acessos_diarios').select('id').eq('usuario_id', MinhaArea.user.id).eq('data_referencia', d.toISOString().split('T')[0]);
        if (data && data.length > 0) { if(box) box.classList.add('hidden'); } else { if(box) box.classList.remove('hidden'); }
    },

    confirmarAcessoHoje: async function() {
        const btn = document.querySelector('#box-confirmacao-leitura button');
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
        const d = new Date(); d.setDate(d.getDate() - 1);
        const { error } = await MinhaArea.supabase.from('acessos_diarios').insert({ usuario_id: MinhaArea.user.id, data_referencia: d.toISOString().split('T')[0] });
        if(!error) { document.getElementById('box-confirmacao-leitura').classList.add('hidden'); alert("Check-in confirmado!"); } 
        else { alert("Erro: " + error.message); if(btn) btn.innerText = "Tentar Novamente"; }
    }
};
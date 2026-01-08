MinhaArea.Diario = {
    
    carregar: async function() {
        // Verifica se o usuário e o banco estão prontos
        if (!MinhaArea.user || !MinhaArea.supabase) {
            console.warn("MinhaArea: Usuário ou Supabase não inicializados.");
            return;
        }

        const periodo = MinhaArea.getPeriodo();
        const uid = MinhaArea.user.id;
        const tbody = document.getElementById('tabela-diario');

        console.log(`MinhaArea: Buscando dados para UserID ${uid} entre ${periodo.inicio} e ${periodo.fim}`);

        if(tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Atualizando dados...</td></tr>';

        // 1. Verifica Check-in de Presença
        this.verificarAcessoHoje();

        try {
            // BUSCA DADOS DE PRODUÇÃO
            const { data: producao, error } = await MinhaArea.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            console.log("MinhaArea: Dados recebidos:", producao);

            // BUSCA METAS VIGENTES (Para calcular % se não tiver meta gravada)
            const { data: metas } = await MinhaArea.supabase
                .from('metas')
                .select('*')
                .eq('usuario_id', uid)
                .order('data_inicio', { ascending: false });

            // BUSCA MÉDIA DO TIME (Para o Card de Comparação)
            const { data: producaoTime } = await MinhaArea.supabase
                .from('producao')
                .select('quantidade, fator, usuarios!inner(perfil)')
                .eq('usuarios.perfil', 'assistente') // Filtra apenas assistentes
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim);

            // --- PROCESSAMENTO ---
            
            // 1. Dados Pessoais
            const dadosProcessados = producao.map(item => {
                // Define Meta Base: Usa a gravada ou procura na tabela de metas
                let metaBase = 650; 
                if (item.meta_diaria && Number(item.meta_diaria) > 0) {
                    metaBase = Number(item.meta_diaria);
                } else if (metas && metas.length > 0) {
                    const m = metas.find(meta => meta.data_inicio <= item.data_referencia);
                    if (m) metaBase = Number(m.valor_meta);
                }

                // Trata Fator
                let fator = 1;
                if (item.fator !== null && item.fator !== undefined) fator = Number(item.fator);

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

            // 2. Média do Time
            let mediaTime = 0;
            if (producaoTime && producaoTime.length > 0) {
                const totalTime = producaoTime.reduce((acc, curr) => acc + (Number(curr.quantidade)||0), 0);
                const diasTime = producaoTime.reduce((acc, curr) => acc + (Number(curr.fator) > 0 ? 1 : 0), 0);
                mediaTime = diasTime > 0 ? Math.round(totalTime / diasTime) : 0;
            }

            // ATUALIZA TELA
            this.atualizarKPIs(dadosProcessados, mediaTime);
            this.atualizarTabelaDiaria(dadosProcessados);

        } catch (e) {
            console.error("Erro MinhaArea:", e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    atualizarKPIs: function(dados, mediaTime) {
        const totalProd = dados.reduce((acc, curr) => acc + curr.quantidade, 0);
        
        // Meta Acumulada: Soma das metas diárias ajustadas pelo fator
        const totalMeta = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? (curr.meta_original * curr.fator) : 0), 0);
        
        // Dias Trabalhados (Fator > 0)
        const diasEfetivos = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? 1 : 0), 0);
        
        const minhaMedia = diasEfetivos > 0 ? Math.round(totalProd / diasEfetivos) : 0;
        const atingimento = totalMeta > 0 ? Math.round((totalProd / totalMeta) * 100) : 0;

        // Atualiza Cards
        this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-total', Math.round(totalMeta).toLocaleString('pt-BR'));
        this.setTxt('kpi-pct', `${atingimento}%`);
        
        const bar = document.getElementById('bar-progress');
        if(bar) {
            bar.style.width = `${Math.min(atingimento, 100)}%`;
            if (atingimento >= 100) bar.className = "h-full bg-emerald-500 rounded-full transition-all duration-500";
            else if (atingimento >= 90) bar.className = "h-full bg-blue-500 rounded-full transition-all duration-500";
            else bar.className = "h-full bg-amber-500 rounded-full transition-all duration-500";
        }

        // Comparativo
        this.setTxt('kpi-media-real', minhaMedia.toLocaleString('pt-BR'));
        this.setTxt('kpi-media-time', mediaTime.toLocaleString('pt-BR'));
        
        const compMsg = document.getElementById('kpi-comparativo-msg');
        if(compMsg) {
            if(minhaMedia > mediaTime) compMsg.innerHTML = '<span class="text-emerald-600 font-bold"><i class="fas fa-arrow-up mr-1"></i>Acima da média!</span>';
            else if(minhaMedia < mediaTime) compMsg.innerHTML = '<span class="text-amber-600 font-bold"><i class="fas fa-arrow-down mr-1"></i>Abaixo da média.</span>';
            else compMsg.innerHTML = '<span class="text-blue-600 font-bold">Na média do time.</span>';
        }

        // Status
        this.setTxt('kpi-dias', diasEfetivos);
        const txtStatus = document.getElementById('kpi-status-text');
        if(txtStatus) {
            if(atingimento >= 100) txtStatus.innerHTML = "<span class='text-emerald-600'>Excelente! Meta batida.</span>";
            else if(atingimento >= 85) txtStatus.innerHTML = "<span class='text-blue-600'>Bom desempenho.</span>";
            else txtStatus.innerHTML = "<span class='text-amber-600'>Precisa melhorar.</span>";
        }
    },

    atualizarTabelaDiaria: function(dados) {
        const tbody = document.getElementById('tabela-diario');
        if (!tbody) return;
        
        if (!dados.length) { 
            const dataInput = document.getElementById('ma-global-date').value;
            const [ano, mes] = dataInput.split('-');
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-12 text-slate-400">
                Nenhum dado encontrado em ${mes}/${ano}.<br>
                <span class="text-xs">Verifique se o arquivo foi importado na tela de Produtividade.</span>
            </td></tr>`; 
            return; 
        }
        
        let html = '';
        dados.forEach(item => {
            const fator = item.fator;
            const metaDia = item.meta_ajustada;
            const pct = metaDia > 0 ? Math.round((item.quantidade / metaDia) * 100) : 0;
            
            // Definição visual do Status
            let statusBadge = '';
            if (fator === 0) {
                statusBadge = '<span class="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[10px] font-bold uppercase border border-slate-200">Abonado</span>';
            } else {
                let cor = 'bg-amber-50 text-amber-700 border-amber-200';
                if(pct >= 100) cor = 'bg-emerald-100 text-emerald-700 border-emerald-200';
                else if(pct >= 80) cor = 'bg-blue-50 text-blue-700 border-blue-200';
                
                statusBadge = `<span class="${cor} px-2 py-1 rounded text-[10px] font-bold border">${pct}%</span>`;
            }

            // Data formatada
            const dFmt = item.data_referencia.split('-').reverse().join('/');
            
            // Monta Observações
            let obsHtml = '';
            if (item.observacao) obsHtml += `<div class="mb-1">${item.observacao}</div>`;
            if (item.justificativa) obsHtml += `<div class="text-xs text-slate-500 italic"><i class="fas fa-info-circle mr-1"></i>Justificativa: ${item.justificativa}</div>`;
            if (item.observacao_gestora) obsHtml += `<div class="mt-1 text-[10px] bg-blue-50 text-blue-700 p-1 rounded border border-blue-100"><i class="fas fa-comment mr-1"></i>Gestão: ${item.observacao_gestora}</div>`;
            if (!obsHtml) obsHtml = '<span class="text-slate-300">-</span>';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition">
                <td class="px-6 py-4 font-bold text-slate-600">${dFmt}</td>
                <td class="px-6 py-4 text-center text-lg font-black text-slate-700">${item.quantidade}</td>
                <td class="px-6 py-4 text-center">
                    <div class="flex flex-col items-center">
                        <span class="text-xs font-bold text-slate-500">${Math.round(item.meta_original)}</span>
                        ${fator < 1 ? `<span class="text-[9px] bg-amber-100 text-amber-800 px-1 rounded border border-amber-200">x${fator}</span>` : ''}
                    </div>
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

    // --- CHECK-IN DIÁRIO (Lógica Mantida) ---
    verificarAcessoHoje: async function() {
        if (MinhaArea.user && (MinhaArea.user.cargo === 'GESTORA' || MinhaArea.user.cargo === 'AUDITORA')) return;

        const box = document.getElementById('box-confirmacao-leitura');
        const dataOntem = new Date();
        dataOntem.setDate(dataOntem.getDate() - 1);
        
        // Ignora Fim de Semana (Sábado/Domingo)
        if(dataOntem.getDay() === 0 || dataOntem.getDay() === 6) {
            if(box) box.classList.add('hidden');
            return;
        }

        const dataRef = dataOntem.toISOString().split('T')[0];

        const { data: reg } = await MinhaArea.supabase
            .from('acessos_diarios')
            .select('id')
            .eq('usuario_id', MinhaArea.user.id)
            .eq('data_referencia', dataRef);
            
        if (reg && reg.length > 0) {
            if(box) box.classList.add('hidden');
        } else {
            if(box) box.classList.remove('hidden');
        }
    },

    confirmarAcessoHoje: async function() {
        const btn = document.querySelector('#box-confirmacao-leitura button');
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
        
        const dataOntem = new Date();
        dataOntem.setDate(dataOntem.getDate() - 1);
        const dataRef = dataOntem.toISOString().split('T')[0];
        
        const { error } = await MinhaArea.supabase.from('acessos_diarios').insert({
            usuario_id: MinhaArea.user.id,
            data_referencia: dataRef 
        });
        
        if(!error) {
            const box = document.getElementById('box-confirmacao-leitura');
            box.classList.add('hidden');
            alert("Confirmado com sucesso!");
        } else {
            alert("Erro: " + error.message);
            if(btn) btn.innerText = "Tentar Novamente";
        }
    }
};
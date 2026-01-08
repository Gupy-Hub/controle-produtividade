// Renomeado internamente para MinhaArea.Diario para refletir o novo nome da aba
MinhaArea.Diario = {
    
    carregar: async function() {
        if (!MinhaArea.user) return;

        const periodo = MinhaArea.getPeriodo();
        const uid = MinhaArea.user.id;
        const tbody = document.getElementById('tabela-diario');

        if(tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i> Atualizando seu diário...</td></tr>';

        // 1. Verifica Check-in (Presença)
        this.verificarAcessoHoje();

        try {
            // --- DADOS DO USUÁRIO ---
            const { data: producao, error } = await MinhaArea.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim)
                .order('data_referencia', { ascending: false });

            if (error) throw error;

            // Busca metas vigentes
            const { data: metas } = await MinhaArea.supabase
                .from('metas')
                .select('*')
                .eq('usuario_id', uid)
                .order('data_inicio', { ascending: false });

            // --- DADOS DO TIME (Para Comparação) ---
            // Busca produção de TODOS os assistentes no mesmo período
            const { data: producaoTime } = await MinhaArea.supabase
                .from('producao')
                .select('quantidade, fator, usuarios!inner(perfil)')
                .eq('usuarios.perfil', 'assistente') // Filtra só assistentes
                .gte('data_referencia', periodo.inicio)
                .lte('data_referencia', periodo.fim);

            // PROCESSAMENTO DOS DADOS PESSOAIS
            const dadosProcessados = producao.map(item => {
                let metaBase = 650;
                if (item.meta_diaria !== null) metaBase = Number(item.meta_diaria);
                else if (metas && metas.length > 0) {
                    const metaVigente = metas.find(m => m.data_inicio <= item.data_referencia);
                    if (metaVigente) metaBase = Number(metaVigente.valor_meta);
                }

                let fator = 1;
                if (item.fator !== undefined && item.fator !== null) fator = Number(item.fator);
                else if (item.fator_multiplicador !== undefined && item.fator_multiplicador !== null) fator = Number(item.fator_multiplicador);

                return {
                    id: item.id,
                    data_referencia: item.data_referencia,
                    quantidade: Number(item.quantidade) || 0,
                    meta_original: metaBase,
                    meta_ajustada: Math.round(metaBase * (fator === 0 ? 0 : fator)),
                    fator: fator,
                    observacao: item.observacao,
                    observacao_gestora: item.observacao_gestora
                };
            });

            // PROCESSAMENTO DA MÉDIA DO TIME
            let mediaTime = 0;
            if (producaoTime && producaoTime.length > 0) {
                const totalProdTime = producaoTime.reduce((acc, curr) => acc + (Number(curr.quantidade)||0), 0);
                // Soma dias efetivos do time (onde fator > 0)
                const diasTime = producaoTime.reduce((acc, curr) => {
                    const f = curr.fator !== null ? Number(curr.fator) : 1;
                    return acc + (f > 0 ? 1 : 0);
                }, 0);
                mediaTime = diasTime > 0 ? Math.round(totalProdTime / diasTime) : 0;
            }

            this.atualizarKPIs(dadosProcessados, mediaTime);
            this.atualizarTabelaDiaria(dadosProcessados);

        } catch (e) {
            console.error("Erro Diario:", e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    atualizarKPIs: function(dados, mediaTime) {
        const totalProd = dados.reduce((acc, curr) => acc + curr.quantidade, 0);
        const totalMeta = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? curr.meta_original * curr.fator : 0), 0);
        const diasEfetivos = dados.reduce((acc, curr) => acc + (curr.fator > 0 ? 1 : 0), 0);
        const minhaMedia = diasEfetivos > 0 ? Math.round(totalProd / diasEfetivos) : 0;
        const atingimento = totalMeta > 0 ? Math.round((totalProd / totalMeta) * 100) : 0;

        // Card 1: Atingimento
        this.setTxt('kpi-total', totalProd.toLocaleString('pt-BR'));
        this.setTxt('kpi-meta-total', Math.round(totalMeta).toLocaleString('pt-BR'));
        this.setTxt('kpi-pct', `${atingimento}%`);
        
        const bar = document.getElementById('bar-progress');
        if(bar) {
            bar.style.width = `${Math.min(atingimento, 100)}%`;
            if(atingimento >= 100) bar.className = "h-full bg-emerald-500 rounded-full";
            else if(atingimento >= 90) bar.className = "h-full bg-blue-500 rounded-full";
            else bar.className = "h-full bg-amber-500 rounded-full";
        }

        // Card 2: Comparativo (Novo)
        this.setTxt('kpi-media-real', minhaMedia.toLocaleString('pt-BR'));
        this.setTxt('kpi-media-time', mediaTime.toLocaleString('pt-BR'));
        
        const compMsg = document.getElementById('kpi-comparativo-msg');
        if(compMsg) {
            if(minhaMedia > mediaTime) compMsg.innerHTML = '<span class="text-emerald-600"><i class="fas fa-arrow-up mr-1"></i>Acima da média! Parabéns.</span>';
            else if(minhaMedia < mediaTime) compMsg.innerHTML = '<span class="text-amber-600"><i class="fas fa-arrow-down mr-1"></i>Abaixo da média do time.</span>';
            else compMsg.innerHTML = '<span class="text-blue-600">Exatamente na média.</span>';
        }

        // Card 3: Status
        this.setTxt('kpi-dias', diasEfetivos);
        const icon = document.getElementById('icon-status');
        const txt = document.getElementById('kpi-status-text');
        
        if(icon && txt) {
            if(atingimento >= 100) {
                icon.className = "fas fa-star text-emerald-500 text-xl";
                txt.innerText = "Excelente! Meta Batida.";
                txt.className = "text-xs font-bold text-emerald-600";
            } else if (atingimento >= 85) {
                icon.className = "fas fa-thumbs-up text-blue-500 text-xl";
                txt.innerText = "Bom ritmo.";
                txt.className = "text-xs font-bold text-blue-600";
            } else {
                icon.className = "fas fa-exclamation text-amber-500 text-xl";
                txt.innerText = "Atenção ao ritmo.";
                txt.className = "text-xs font-bold text-amber-600";
            }
        }
    },

    atualizarTabelaDiaria: function(dados) {
        const tbody = document.getElementById('tabela-diario');
        if (!tbody) return;
        
        if (!dados.length) { 
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400">Nenhuma produção registrada neste período.</td></tr>'; 
            return; 
        }
        
        let html = '';
        dados.sort((a,b) => new Date(b.data_referencia) - new Date(a.data_referencia));

        dados.forEach(item => {
            const fator = item.fator;
            const metaDoDia = item.meta_ajustada;
            const pct = metaDoDia > 0 ? Math.round((item.quantidade / metaDoDia) * 100) : 0;
            
            let statusHtml = '';
            if (fator === 0) {
                statusHtml = '<span class="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[10px] font-bold uppercase border border-slate-200">Abonado</span>';
            } else {
                let colorClass = pct >= 100 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 
                                 pct >= 80 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200';
                statusHtml = `<span class="${colorClass} px-2 py-1 rounded text-[10px] font-bold uppercase border">${pct}%</span>`;
            }

            const dFmt = item.data_referencia.split('-').reverse().join('/');
            
            // Observações e Feedback
            let obs = item.observacao || '';
            if (obs.includes('Abonos:')) obs = `<span class="text-amber-600 font-bold bg-amber-50 px-1 rounded text-[10px] border border-amber-100">${obs}</span>`;
            
            if(item.observacao_gestora) {
                obs += `<div class="mt-1 text-[10px] text-blue-700 bg-blue-50 p-1.5 rounded border border-blue-100"><i class="fas fa-comment-dots mr-1"></i>${item.observacao_gestora}</div>`;
            }
            if(!obs) obs = '<span class="text-slate-300">-</span>';

            html += `<tr class="hover:bg-slate-50 border-b border-slate-50 transition">
                        <td class="px-6 py-4 font-bold text-slate-600">${dFmt}</td>
                        <td class="px-6 py-4 text-center font-black text-slate-700 text-lg">${item.quantidade}</td>
                        <td class="px-6 py-4 text-center text-xs text-slate-500">
                            ${Math.round(item.meta_original)} 
                            ${fator < 1 && fator > 0 ? `<span class="text-amber-600 font-bold ml-1" title="Fator">x${fator}</span>` : ''}
                        </td>
                        <td class="px-6 py-4 text-center">${statusHtml}</td>
                        <td class="px-6 py-4 text-xs text-slate-500 max-w-sm break-words">${obs}</td>
                    </tr>`;
        });
        tbody.innerHTML = html;
    },

    setTxt: function(id, txt) {
        const el = document.getElementById(id);
        if(el) el.innerText = txt;
    },

    // --- FUNCIONALIDADE: PRESENÇA (ONTEM) --- //
    verificarAcessoHoje: async function() {
        // Se for gestora vendo "Minha Área", não precisa confirmar presença
        if (MinhaArea.user && (MinhaArea.user.cargo === 'GESTORA' || MinhaArea.user.cargo === 'AUDITORA')) return;

        const box = document.getElementById('box-confirmacao-leitura');
        
        // Data de Ontem
        const data = new Date();
        data.setDate(data.getDate() - 1); 
        const dataRef = data.toISOString().split('T')[0];
        
        // Ignora Fim de Semana
        const diaSemana = data.getDay();
        if(diaSemana === 0 || diaSemana === 6) {
            if(box) box.classList.add('hidden');
            return;
        }

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
        const data = new Date();
        data.setDate(data.getDate() - 1);
        const dataRef = data.toISOString().split('T')[0];
        
        const btn = document.querySelector('#box-confirmacao-leitura button');
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Confirmando...';
        
        const { error } = await MinhaArea.supabase.from('acessos_diarios').insert({
            usuario_id: MinhaArea.user.id,
            data_referencia: dataRef 
        });
        
        if(error) {
            alert("Erro: " + error.message);
            if(btn) btn.innerText = 'Tentar Novamente';
        } else {
            // Animação de saída
            const box = document.getElementById('box-confirmacao-leitura');
            box.classList.add('opacity-0', 'transition', 'duration-500');
            setTimeout(() => box.classList.add('hidden'), 500);
            alert("Check-in confirmado! Bom trabalho hoje.");
        }
    }
};
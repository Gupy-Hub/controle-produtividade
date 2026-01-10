MinhaArea.Diario = {
    initialized: false,
    
    init: function() {
        if (!this.initialized) this.initialized = true;
        
        // Data padrão: Hoje
        const inputData = document.getElementById('input-data-lancamento');
        if (inputData && !inputData.value) {
            inputData.value = new Date().toISOString().split('T')[0];
        }
        
        this.carregarDadosDoDia();
        this.carregarHistoricoRecente();
        this.atualizarKPIsMensais();
    },

    carregarDadosDoDia: async function() {
        const data = document.getElementById('input-data-lancamento').value;
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        this.atualizarStatus('carregando');
        this.limparFormulario();

        try {
            const { data: reg, error } = await Sistema.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .eq('data_referencia', data)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;

            if (reg) {
                document.getElementById('input-quantidade').value = reg.quantidade || '';
                document.getElementById('input-fifo').value = reg.fifo || '';
                document.getElementById('input-gt').value = reg.gradual_total || '';
                document.getElementById('input-gp').value = reg.gradual_parcial || '';
                document.getElementById('input-fc').value = reg.perfil_fc || '';
                document.getElementById('input-obs').value = reg.justificativa || '';
                this.atualizarStatus('salvo');
            } else {
                this.atualizarStatus('novo');
            }
        } catch (err) {
            console.error(err);
            this.atualizarStatus('erro');
        }
    },

    salvar: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return alert("Erro de sessão.");

        const dataRef = document.getElementById('input-data-lancamento').value;
        const dados = {
            usuario_id: uid,
            data_referencia: dataRef,
            quantidade: document.getElementById('input-quantidade').value || 0,
            fifo: document.getElementById('input-fifo').value || 0,
            gradual_total: document.getElementById('input-gt').value || 0,
            gradual_parcial: document.getElementById('input-gp').value || 0,
            perfil_fc: document.getElementById('input-fc').value || 0,
            justificativa: document.getElementById('input-obs').value,
            fator: 1 // Default
        };

        try {
            // Verifica existência para UPSERT manual
            const { data: existente } = await Sistema.supabase
                .from('producao').select('id').eq('usuario_id', uid).eq('data_referencia', dataRef).maybeSingle();

            if (existente) {
                await Sistema.supabase.from('producao').update(dados).eq('id', existente.id);
            } else {
                await Sistema.supabase.from('producao').insert(dados);
            }

            alert("Salvo com sucesso!");
            this.atualizarStatus('salvo');
            this.carregarHistoricoRecente(); // Atualiza tabela lateral
            this.atualizarKPIsMensais(); // Atualiza cards

        } catch (err) {
            console.error(err);
            alert("Erro ao salvar.");
        }
    },

    carregarHistoricoRecente: async function() {
        const tbody = document.getElementById('tabela-historico-body');
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!tbody || !uid) return;

        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400"><i class="fas fa-spinner fa-spin"></i></td></tr>';

        try {
            // Pega os últimos 10 registros
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .order('data_referencia', { ascending: false })
                .limit(10);

            if (error) throw error;

            tbody.innerHTML = '';
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400 text-xs italic">Nenhum registro recente.</td></tr>';
                return;
            }

            data.forEach(r => {
                const [ano, mes, dia] = r.data_referencia.split('-');
                
                // Status Visual
                let statusIcon = '<span class="text-emerald-500 font-bold"><i class="fas fa-check"></i> OK</span>';
                if (r.fator != 1) statusIcon = '<span class="text-amber-500 font-bold text-[10px]">Ajustado</span>';

                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition border-b border-slate-50 last:border-0";
                tr.innerHTML = `
                    <td class="px-4 py-2 font-bold text-slate-600">${dia}/${mes}</td>
                    <td class="px-4 py-2 text-center font-black text-blue-600">${r.quantidade}</td>
                    <td class="px-4 py-2 text-center text-slate-500">${r.fator}</td>
                    <td class="px-4 py-2 text-center text-xs">${statusIcon}</td>
                    <td class="px-4 py-2 text-slate-400 text-[10px] truncate max-w-[100px]" title="${r.justificativa || ''}">${r.justificativa || '-'}</td>
                `;
                tbody.appendChild(tr);
            });

        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-red-400 text-xs">Erro ao carregar histórico.</td></tr>';
        }
    },

    atualizarKPIsMensais: async function() {
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;
        if (!uid) return;

        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];

        try {
            const { data, error } = await Sistema.supabase
                .from('producao')
                .select('quantidade, fator')
                .eq('usuario_id', uid)
                .gte('data_referencia', inicioMes)
                .lte('data_referencia', fimMes);

            if (error) throw error;

            let total = 0;
            let diasUteis = 0;
            let diasTrabalhados = 0;

            data.forEach(r => {
                total += (Number(r.quantidade) || 0);
                const f = Number(r.fator) || 0;
                diasUteis += f;
                if (f > 0) diasTrabalhados++;
            });

            const metaMensalEstimada = diasUteis * 650; // Meta base
            const pct = metaMensalEstimada > 0 ? (total / metaMensalEstimada) * 100 : 0;
            const media = diasTrabalhados > 0 ? Math.round(total / diasTrabalhados) : 0;

            // Atualiza UI
            this.setTxt('kpi-total', total.toLocaleString('pt-BR'));
            this.setTxt('kpi-meta-total', Math.round(metaMensalEstimada).toLocaleString('pt-BR'));
            this.setTxt('kpi-pct', Math.round(pct) + '%');
            
            const bar = document.getElementById('bar-progress');
            if(bar) {
                bar.style.width = Math.min(pct, 100) + '%';
                bar.className = pct >= 100 ? "h-full bg-emerald-500 rounded-full" : "h-full bg-blue-500 rounded-full";
            }

            this.setTxt('kpi-media-real', media.toLocaleString('pt-BR'));
            this.setTxt('kpi-dias', diasTrabalhados);

            // Média do Time (Busca separada rápida)
            // Em um app real, isso poderia vir cacheado ou de uma tabela agregada
            // Vamos deixar '...' por enquanto para não pesar, ou fazer uma query leve:
            // this.buscarMediaTime(inicioMes, fimMes); 

        } catch (err) {
            console.error("Erro KPIs:", err);
        }
    },

    // Helpers
    limparFormulario: function() {
        ['input-quantidade', 'input-fifo', 'input-gt', 'input-gp', 'input-fc', 'input-obs'].forEach(id => {
            const el = document.getElementById(id); if(el) el.value = '';
        });
    },
    atualizarStatus: function(status) {
        const el = document.getElementById('status-lancamento');
        if (!el) return;
        if (status === 'carregando') el.innerHTML = '<i class="fas fa-spinner fa-spin text-blue-500"></i> Buscando...';
        else if (status === 'novo') el.innerHTML = '<i class="fas fa-circle text-slate-300 text-[6px]"></i> Novo';
        else if (status === 'salvo') el.innerHTML = '<i class="fas fa-check-circle text-emerald-500"></i> Salvo';
        else if (status === 'erro') el.innerHTML = '<i class="fas fa-exclamation-triangle text-red-500"></i> Erro';
    },
    setTxt: function(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; },
    confirmarLeitura: function() { document.getElementById('box-confirmacao-leitura').classList.add('hidden'); }
};
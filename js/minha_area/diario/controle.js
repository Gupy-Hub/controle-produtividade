MinhaArea.Diario = {
    dataSelecionada: null,

    init: function() {
        const inputData = document.getElementById('input-data-lancamento');
        if (!inputData.value) {
            inputData.value = new Date().toISOString().split('T')[0];
        }
        this.carregarDadosDoDia();
    },

    mudarDia: function(dias) {
        const input = document.getElementById('input-data-lancamento');
        const atual = new Date(input.value);
        atual.setDate(atual.getDate() + dias);
        input.value = atual.toISOString().split('T')[0];
        this.carregarDadosDoDia();
    },

    carregarDadosDoDia: async function() {
        const data = document.getElementById('input-data-lancamento').value;
        this.dataSelecionada = data;
        const uid = MinhaArea.usuario ? MinhaArea.usuario.id : null;

        if (!uid) return console.error("Usuário não identificado");

        // UI de Carregando
        this.atualizarStatus('carregando');
        this.limparFormulario();

        try {
            const { data: registros, error } = await Sistema.supabase
                .from('producao')
                .select('*')
                .eq('usuario_id', uid)
                .eq('data_referencia', data)
                .maybeSingle(); // Retorna 1 ou null

            if (error && error.code !== 'PGRST116') throw error;

            if (registros) {
                // Preenche campos
                document.getElementById('input-quantidade').value = registros.quantidade || '';
                document.getElementById('input-fifo').value = registros.fifo || '';
                document.getElementById('input-gt').value = registros.gradual_total || '';
                document.getElementById('input-gp').value = registros.gradual_parcial || '';
                document.getElementById('input-fc').value = registros.perfil_fc || '';
                document.getElementById('input-obs').value = registros.justificativa || '';
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
        if (!uid) return alert("Erro de sessão. Faça login novamente.");

        const dados = {
            usuario_id: uid,
            data_referencia: this.dataSelecionada,
            quantidade: document.getElementById('input-quantidade').value || 0,
            fifo: document.getElementById('input-fifo').value || 0,
            gradual_total: document.getElementById('input-gt').value || 0,
            gradual_parcial: document.getElementById('input-gp').value || 0,
            perfil_fc: document.getElementById('input-fc').value || 0,
            justificativa: document.getElementById('input-obs').value,
            fator: 1 // Default 100%, gestão altera se necessário
        };

        // Validação Simples
        if (dados.quantidade == 0 && dados.justificativa.trim() === "") {
            if(!confirm("A produção está zerada e sem justificativa. Deseja salvar mesmo assim?")) return;
        }

        try {
            // UPSERT: Se existir (usuario_id + data) atualiza, senão cria.
            // Isso requer uma constraint única no banco (usuario_id, data_referencia)
            // Caso não tenha constraint, teríamos que fazer check antes. Vamos assumir logica simples:
            
            // 1. Verifica ID existente (já buscamos no carregar)
            const { data: existente } = await Sistema.supabase
                .from('producao')
                .select('id')
                .eq('usuario_id', uid)
                .eq('data_referencia', this.dataSelecionada)
                .maybeSingle();

            let error;
            if (existente) {
                // Update
                const res = await Sistema.supabase.from('producao').update(dados).eq('id', existente.id);
                error = res.error;
            } else {
                // Insert
                const res = await Sistema.supabase.from('producao').insert(dados);
                error = res.error;
            }

            if (error) throw error;

            alert("Salvo com sucesso!");
            this.atualizarStatus('salvo');

        } catch (err) {
            console.error(err);
            alert("Erro ao salvar: " + err.message);
        }
    },

    limparFormulario: function() {
        ['input-quantidade', 'input-fifo', 'input-gt', 'input-gp', 'input-fc', 'input-obs'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
    },

    atualizarStatus: function(status) {
        const el = document.getElementById('status-lancamento');
        if (!el) return;

        if (status === 'carregando') el.innerHTML = '<i class="fas fa-spinner fa-spin text-blue-500"></i> Buscando...';
        else if (status === 'novo') el.innerHTML = '<i class="fas fa-circle text-slate-300 text-[8px]"></i> Novo Lançamento';
        else if (status === 'salvo') el.innerHTML = '<i class="fas fa-check-circle text-emerald-500"></i> Salvo no Banco';
        else if (status === 'erro') el.innerHTML = '<i class="fas fa-exclamation-triangle text-red-500"></i> Erro de Conexão';
    }
};
Gestao.Metas = {
    estado: {
        mes: new Date().getMonth() + 1, // Começa no mês atual
        ano: new Date().getFullYear(),
        lista: []
    },

    init: function() {
        this.atualizarLabelPeriodo();
        this.carregar();
    },

    mudarMes: function(delta) {
        let novoMes = this.estado.mes + delta;
        if (novoMes > 12) {
            novoMes = 1;
            this.estado.ano++;
        } else if (novoMes < 1) {
            novoMes = 12;
            this.estado.ano--;
        }
        this.estado.mes = novoMes;
        this.atualizarLabelPeriodo();
        this.carregar();
    },

    atualizarLabelPeriodo: function() {
        const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const label = document.getElementById('metas-periodo-label');
        if (label) label.innerText = `${nomesMeses[this.estado.mes - 1]} de ${this.estado.ano}`;
    },

    carregar: async function() {
        const tbody = document.getElementById('lista-metas');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-12"><i class="fas fa-spinner fa-spin text-blue-500 text-2xl"></i></td></tr>';

        // 1. Busca Usuários Ativos
        const { data: usuarios, error: errUser } = await Sistema.supabase
            .from('usuarios')
            .select('*')
            .eq('ativo', true)
            .order('nome');

        if (errUser) { console.error(errUser); return; }

        // 2. Busca Metas já definidas para o mês selecionado
        const { data: metasExistentes, error: errMeta } = await Sistema.supabase
            .from('metas')
            .select('*')
            .eq('mes', this.estado.mes)
            .eq('ano', this.estado.ano);

        // 3. Mescla os dados (Usuário + Meta se existir)
        this.estado.lista = usuarios.map(u => {
            const metaEncontrada = metasExistentes?.find(m => m.usuario_id === u.id);
            return {
                ...u,
                meta_valor: metaEncontrada ? metaEncontrada.meta_assertividade : null,
                meta_id: metaEncontrada ? metaEncontrada.id : null
            };
        });

        this.renderizar();
    },

    renderizar: function() {
        const tbody = document.getElementById('lista-metas');
        if (!tbody) return;

        let html = '';
        this.estado.lista.forEach(item => {
            const metaVal = item.meta_valor !== null ? item.meta_valor : '';
            const contratoClass = item.contrato === 'PJ' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-slate-50 text-slate-600 border-slate-200';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition">
                <td class="px-6 py-4 text-center">
                    <input type="checkbox" class="check-meta-item w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" value="${item.id}">
                </td>
                <td class="px-6 py-4 font-mono text-slate-400 text-xs">#${item.id}</td>
                <td class="px-6 py-4 font-bold text-slate-700">${item.nome}</td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded text-[10px] font-bold border ${contratoClass}">${item.contrato || 'ND'}</span>
                </td>
                <td class="px-6 py-4 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <input type="number" 
                               id="meta-input-${item.id}" 
                               value="${metaVal}" 
                               step="0.1" 
                               class="w-24 text-center border border-slate-300 rounded-lg py-1.5 text-sm font-bold text-slate-700 focus:border-blue-500 outline-none focus:ring-2 focus:ring-blue-100 transition"
                               placeholder="0.00">
                        <span class="text-slate-400 font-bold">%</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-right">
                    <button class="text-xs text-blue-500 hover:underline">Ver Histórico</button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
        this.atualizarResumo();
    },

    // Selecionar Todos
    toggleSelecionarTodos: function() {
        const master = document.getElementById('check-meta-todos');
        const checks = document.querySelectorAll('.check-meta-item');
        checks.forEach(c => c.checked = master.checked);
    },

    // Aplica valor do input de massa para os selecionados
    aplicarEmMassa: function() {
        const valorMassa = document.getElementById('input-meta-massa').value;
        if (!valorMassa) return alert("Digite um valor para aplicar.");

        const checks = document.querySelectorAll('.check-meta-item:checked');
        if (checks.length === 0) return alert("Selecione pelo menos um usuário na lista.");

        checks.forEach(chk => {
            const uid = chk.value;
            const inputIndividual = document.getElementById(`meta-input-${uid}`);
            if (inputIndividual) inputIndividual.value = valorMassa;
        });
        
        // Remove seleção após aplicar
        document.getElementById('check-meta-todos').checked = false;
        checks.forEach(c => c.checked = false);
    },

    salvarTodas: async function() {
        const btn = document.querySelector('button[onclick="Gestao.Metas.salvarTodas()"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        btn.disabled = true;

        const upserts = [];
        
        this.estado.lista.forEach(item => {
            const input = document.getElementById(`meta-input-${item.id}`);
            const valor = input ? input.value : '';

            // Só salva se tiver valor preenchido
            if (valor !== '' && valor !== null) {
                upserts.push({
                    usuario_id: item.id,
                    usuario_nome: item.nome,
                    mes: this.estado.mes,
                    ano: this.estado.ano,
                    meta_assertividade: parseFloat(valor)
                });
            }
        });

        if (upserts.length === 0) {
            btn.innerHTML = originalText;
            btn.disabled = false;
            return alert("Nenhuma meta preenchida para salvar.");
        }

        // Upsert no Supabase (Atualiza se existir, cria se não)
        const { error } = await Sistema.supabase
            .from('metas')
            .upsert(upserts, { onConflict: 'usuario_id, mes, ano' });

        btn.innerHTML = originalText;
        btn.disabled = false;

        if (error) {
            console.error(error);
            alert("Erro ao salvar: " + error.message);
        } else {
            alert("Metas atualizadas com sucesso!");
            this.carregar(); // Recarrega para confirmar
        }
    },

    atualizarResumo: function() {
        const total = this.estado.lista.length;
        const footer = document.getElementById('resumo-metas-footer');
        if(footer) footer.innerText = `Total de Assistentes Listados: ${total}`;
    }
};

// Inicializa ao carregar a página se estiver na aba correta (opcional)
// Mas geralmente é chamado pelo Gestao.mudarAba('metas')
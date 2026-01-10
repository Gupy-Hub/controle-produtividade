Gestao.Metas = {
    dataAtual: new Date(), 
    dadosAtuais: [], 

    init: function() {
        this.dataAtual = new Date(); 
        this.dataAtual.setDate(1);
    },

    carregar: async function() {
        const mes = this.dataAtual.getMonth() + 1; 
        const ano = this.dataAtual.getFullYear();
        
        // Atualiza Labels
        const nomeMes = this.dataAtual.toLocaleString('pt-BR', { month: 'long' });
        if(document.getElementById('metas-periodo-label')) {
            document.getElementById('metas-periodo-label').innerText = `${nomeMes} ${ano}`;
        }

        // Reseta checkbox mestre
        if(document.getElementById('check-meta-todos')) document.getElementById('check-meta-todos').checked = false;

        const tbody = document.getElementById('lista-metas');
        if(tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-12"><i class="fas fa-spinner fa-spin text-blue-500 text-2xl"></i><p class="text-slate-400 mt-2">Carregando metas...</p></td></tr>';
        }

        try {
            const { data, error } = await Sistema.supabase.rpc('buscar_metas_periodo', { 
                p_mes: parseInt(mes), 
                p_ano: parseInt(ano) 
            });

            if (error) throw error;

            this.dadosAtuais = data || [];
            this.renderizarTabela();
            this.atualizarResumo();

        } catch (e) {
            console.error(e);
            if(tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    mudarMes: function(delta) {
        this.dataAtual.setMonth(this.dataAtual.getMonth() + delta);
        this.carregar();
    },

    renderizarTabela: function() {
        const tbody = document.getElementById('lista-metas');
        const lista = this.dadosAtuais;

        if (!tbody) return;

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-12 text-slate-400">Nenhum usuário ativo encontrado para este período.</td></tr>';
            return;
        }

        let html = '';
        lista.forEach(user => {
            const valorMeta = user.meta_definida !== null ? user.meta_definida : '';
            const inputClass = valorMeta ? 'font-bold text-blue-700' : 'text-slate-500';

            html += `
            <tr class="hover:bg-slate-50 transition group border-b border-slate-50">
                <td class="px-6 py-4 text-center">
                    <input type="checkbox" class="check-meta-row w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" value="${user.usuario_id}">
                </td>
                
                <td class="px-6 py-4 font-mono text-slate-500">#${user.usuario_id}</td>
                <td class="px-6 py-4 font-bold text-slate-700">
                    ${user.nome}
                    ${this.isNovato(user.data_inicio) ? '<span class="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] rounded-full uppercase">Novo</span>' : ''}
                </td>
                <td class="px-6 py-4 text-slate-600 text-xs uppercase font-bold tracking-wider">${user.contrato || '-'}</td>
                
                <td class="px-6 py-2 text-center">
                    <div class="relative max-w-[120px] mx-auto">
                        <input type="number" 
                               id="meta-input-${user.usuario_id}" 
                               value="${valorMeta}" 
                               placeholder="-"
                               class="w-full text-center py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition ${inputClass}"
                               onchange="Gestao.Metas.marcarAlterado(${user.usuario_id})">
                    </div>
                </td>

                <td class="px-6 py-4 text-right">
                    <button onclick="Gestao.Metas.verHistorico(${user.usuario_id}, '${user.nome}')" class="text-slate-400 hover:text-blue-600 transition p-2" title="Ver evolução">
                        <i class="fas fa-chart-line"></i>
                    </button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
    },

    atualizarResumo: function() {
        let totalMeta = 0;
        this.dadosAtuais.forEach(u => {
            // Tenta pegar o valor visual do input se existir, senão usa o do banco
            const input = document.getElementById(`meta-input-${u.usuario_id}`);
            if(input && input.value) totalMeta += parseInt(input.value);
            else if(u.meta_definida) totalMeta += u.meta_definida;
        });

        const footer = document.getElementById('resumo-metas-footer');
        if(footer) footer.innerText = `Total Previsto: ${totalMeta.toLocaleString('pt-BR')}`;
    },

    // --- SELEÇÃO EM MASSA ---

    toggleSelecionarTodos: function() {
        const master = document.getElementById('check-meta-todos');
        const checkboxes = document.querySelectorAll('.check-meta-row');
        checkboxes.forEach(chk => chk.checked = master.checked);
    },

    aplicarEmMassa: function() {
        const valorInput = document.getElementById('input-meta-massa');
        if (!valorInput || !valorInput.value) return alert("Digite um valor no campo de definição em massa.");
        
        const valor = parseInt(valorInput.value);
        const checkboxes = document.querySelectorAll('.check-meta-row:checked');

        if (checkboxes.length === 0) return alert("Selecione pelo menos um usuário na tabela.");

        let count = 0;
        checkboxes.forEach(chk => {
            const userId = chk.value;
            const inputMeta = document.getElementById(`meta-input-${userId}`);
            if (inputMeta) {
                inputMeta.value = valor;
                this.marcarAlterado(userId);
                count++;
            }
        });

        // Atualiza resumo visual
        this.atualizarResumo();
        
        // Feedback visual simples
        const btn = document.querySelector('button[onclick="Gestao.Metas.aplicarEmMassa()"]');
        const htmlOrig = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-check"></i> Aplicado (${count})`;
        setTimeout(() => btn.innerHTML = htmlOrig, 2000);
    },

    // --- LÓGICA DE SALVAMENTO ---

    marcarAlterado: function(id) {
        const input = document.getElementById(`meta-input-${id}`);
        if(input) {
            input.classList.add('bg-yellow-50', 'border-yellow-300', 'font-bold', 'text-blue-700');
            input.classList.remove('text-slate-500');
        }
        this.atualizarResumo();
    },

    salvarTodas: async function() {
        const btnSalvar = document.querySelector('button[onclick="Gestao.Metas.salvarTodas()"]');
        let originalHtml = '';
        if(btnSalvar) {
            originalHtml = btnSalvar.innerHTML;
            btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            btnSalvar.disabled = true;
        }

        const mes = this.dataAtual.getMonth() + 1;
        const ano = this.dataAtual.getFullYear();
        const inserts = [];

        this.dadosAtuais.forEach(user => {
            const input = document.getElementById(`meta-input-${user.usuario_id}`);
            if (input) {
                const valor = input.value.trim();
                if (valor !== '') {
                    inserts.push({
                        usuario_id: user.usuario_id,
                        mes: parseInt(mes),
                        ano: parseInt(ano),
                        meta: parseInt(valor)
                    });
                }
            }
        });

        if (inserts.length === 0) {
            if(btnSalvar) {
                btnSalvar.innerHTML = originalHtml;
                btnSalvar.disabled = false;
            }
            return alert("Nenhuma meta definida para salvar.");
        }

        try {
            const { error } = await Sistema.supabase
                .from('metas')
                .upsert(inserts, { onConflict: 'usuario_id,mes,ano' });

            if (error) throw error;

            alert('Metas atualizadas com sucesso!');
            this.carregar(); 

        } catch (e) {
            console.error(e);
            alert("Erro ao salvar: " + e.message);
        } finally {
            if(btnSalvar) {
                btnSalvar.innerHTML = originalHtml;
                btnSalvar.disabled = false;
            }
        }
    },

    // --- HISTÓRICO ---
    verHistorico: async function(userId, nomeUser) {
        const { data, error } = await Sistema.supabase
            .from('metas')
            .select('mes, ano, meta')
            .eq('usuario_id', userId)
            .order('ano', { ascending: false })
            .order('mes', { ascending: false })
            .limit(12); 

        if(error) return alert("Erro ao buscar histórico");

        const listaHist = data || [];
        
        let htmlLista = '';
        if(listaHist.length === 0) htmlLista = '<p class="text-slate-400 text-center text-sm">Sem histórico.</p>';
        else {
            htmlLista = '<div class="space-y-2">';
            listaHist.forEach(h => {
                const nomeMes = new Date(h.ano, h.mes - 1).toLocaleString('pt-BR', { month: 'long' });
                htmlLista += `
                <div class="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100 text-sm">
                    <span class="capitalize text-slate-600 font-bold">${nomeMes} ${h.ano}</span>
                    <span class="text-blue-600 font-mono font-bold">${h.meta}</span>
                </div>`;
            });
            htmlLista += '</div>';
        }

        const modalHtml = `
        <div id="modal-historico" class="fixed inset-0 bg-slate-900/40 z-[80] flex items-center justify-center backdrop-blur-sm animate-fade">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div class="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 class="text-md font-bold text-slate-800">Histórico: ${nomeUser}</h3>
                    <button onclick="document.getElementById('modal-historico').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
                </div>
                <div class="p-6 max-h-[400px] overflow-y-auto custom-scroll">
                    ${htmlLista}
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    isNovato: function(dataInicio) {
        if (!dataInicio) return false;
        const dInicio = new Date(dataInicio);
        const agora = new Date();
        const diffTime = Math.abs(agora - dInicio);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        return diffDays <= 60; 
    }
};

Gestao.Metas.init();
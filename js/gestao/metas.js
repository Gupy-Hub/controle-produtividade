Gestao.Metas = {
    dataAtual: new Date(), // Controla o mês/ano selecionado na tela
    dadosAtuais: [], // Cache para edição

    init: function() {
        // Define data inicial como hoje, mas dia 1 para evitar problemas de virada de mês
        this.dataAtual = new Date(); 
        this.dataAtual.setDate(1);
    },

    carregar: async function() {
        const mes = this.dataAtual.getMonth() + 1; // JS conta mês de 0 a 11
        const ano = this.dataAtual.getFullYear();
        
        // Atualiza Labels
        const nomeMes = this.dataAtual.toLocaleString('pt-BR', { month: 'long' });
        document.getElementById('metas-periodo-label').innerText = `${nomeMes} ${ano}`;

        const tbody = document.getElementById('lista-metas');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12"><i class="fas fa-spinner fa-spin text-blue-500 text-2xl"></i><p class="text-slate-400 mt-2">Carregando metas...</p></td></tr>';

        try {
            // Chama a função SQL que cruza usuários ativos com a tabela de metas
            const { data, error } = await Sistema.supabase.rpc('buscar_metas_periodo', { 
                p_mes: mes, 
                p_ano: ano 
            });

            if (error) throw error;

            this.dadosAtuais = data || [];
            this.renderizarTabela();
            this.atualizarResumo();

        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-500">Erro: ${e.message}</td></tr>`;
        }
    },

    mudarMes: function(delta) {
        this.dataAtual.setMonth(this.dataAtual.getMonth() + delta);
        this.carregar();
    },

    renderizarTabela: function() {
        const tbody = document.getElementById('lista-metas');
        const lista = this.dadosAtuais;

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400">Nenhum usuário ativo encontrado.</td></tr>';
            return;
        }

        let html = '';
        lista.forEach(user => {
            // Se meta_definida for null, deixa em branco ou sugere placeholder
            const valorMeta = user.meta_definida !== null ? user.meta_definida : '';
            
            // Estilo do Input: Se tiver valor, negrito. Se vazio, normal.
            const inputClass = valorMeta ? 'font-bold text-blue-700' : 'text-slate-500';

            html += `
            <tr class="hover:bg-slate-50 transition group">
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
        let qtdUsers = this.dadosAtuais.length;
        
        // Calcula o total VISUAL (baseado no que veio do banco, não no input editado ainda)
        this.dadosAtuais.forEach(u => {
            if(u.meta_definida) totalMeta += u.meta_definida;
        });

        document.getElementById('resumo-usuarios').innerText = qtdUsers;
        document.getElementById('resumo-total-meta').innerText = totalMeta.toLocaleString('pt-BR');
    },

    // --- LÓGICA DE SALVAMENTO ---

    // Marca visualmente que mudou (opcional, pode ser só interno)
    marcarAlterado: function(id) {
        const input = document.getElementById(`meta-input-${id}`);
        input.classList.add('bg-yellow-50', 'border-yellow-300');
    },

    // Salva TUDO o que está na tela
    salvarTodas: async function() {
        const btnSalvar = document.querySelector('button[onclick="Gestao.Metas.salvarTodas()"]');
        const originalHtml = btnSalvar.innerHTML;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        btnSalvar.disabled = true;

        const mes = this.dataAtual.getMonth() + 1;
        const ano = this.dataAtual.getFullYear();
        const inserts = [];

        // Varre a lista de dados atuais e pega o valor do input correspondente
        this.dadosAtuais.forEach(user => {
            const input = document.getElementById(`meta-input-${user.usuario_id}`);
            if (input) {
                const valor = input.value.trim();
                // Só salva se tiver valor numérico
                if (valor !== '') {
                    inserts.push({
                        usuario_id: user.usuario_id,
                        mes: mes,
                        ano: ano,
                        meta: parseInt(valor)
                    });
                }
            }
        });

        if (inserts.length === 0) {
            btnSalvar.innerHTML = originalHtml;
            btnSalvar.disabled = false;
            return alert("Nenhuma meta definida para salvar.");
        }

        try {
            // Upsert (Insere ou Atualiza se já existir user+mes+ano)
            const { error } = await Sistema.supabase
                .from('metas')
                .upsert(inserts, { onConflict: 'usuario_id,mes,ano' });

            if (error) throw error;

            // Feedback de sucesso
            const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
            Toast.fire({ icon: 'success', title: 'Metas atualizadas com sucesso!' });
            
            this.carregar(); // Recarrega para limpar status de edição

        } catch (e) {
            console.error(e);
            alert("Erro ao salvar: " + e.message);
        } finally {
            btnSalvar.innerHTML = originalHtml;
            btnSalvar.disabled = false;
        }
    },

    // --- FERRAMENTAS EM MASSA ---

    aplicarPadrao: function(valorPadrao) {
        // Aplica o valor padrão APENAS nos inputs que estão vazios
        let count = 0;
        this.dadosAtuais.forEach(user => {
            const input = document.getElementById(`meta-input-${user.usuario_id}`);
            if (input && input.value.trim() === '') {
                input.value = valorPadrao;
                this.marcarAlterado(user.usuario_id);
                count++;
            }
        });
        if(count > 0) alert(`${count} usuários sem meta foram preenchidos com ${valorPadrao}. Clique em Salvar para confirmar.`);
        else alert("Todos os usuários já possuem meta preenchida.");
    },

    // --- HISTÓRICO ---

    verHistorico: async function(userId, nomeUser) {
        // Busca histórico
        const { data, error } = await Sistema.supabase
            .from('metas')
            .select('mes, ano, meta')
            .eq('usuario_id', userId)
            .order('ano', { ascending: false })
            .order('mes', { ascending: false })
            .limit(12); // Últimos 12 registros

        if(error) return alert("Erro ao buscar histórico");

        const listaHist = data || [];
        
        let htmlLista = '';
        if(listaHist.length === 0) htmlLista = '<p class="text-slate-400 text-center">Sem histórico.</p>';
        else {
            htmlLista = '<div class="space-y-2">';
            listaHist.forEach(h => {
                const nomeMes = new Date(h.ano, h.mes - 1).toLocaleString('pt-BR', { month: 'long' });
                htmlLista += `
                <div class="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100">
                    <span class="capitalize text-slate-600 font-bold">${nomeMes} ${h.ano}</span>
                    <span class="text-blue-600 font-mono font-bold">${h.meta}</span>
                </div>`;
            });
            htmlLista += '</div>';
        }

        // Modal Simples usando SweetAlert ou HTML injetado (Vou usar HTML injetado para manter padrão)
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

    // --- UTILITÁRIOS ---
    isNovato: function(dataInicio) {
        if (!dataInicio) return false;
        const dInicio = new Date(dataInicio);
        const agora = new Date();
        const diffTime = Math.abs(agora - dInicio);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        return diffDays <= 60; // Considera novato quem tem menos de 60 dias
    }
};

// Inicializa
Gestao.Metas.init();
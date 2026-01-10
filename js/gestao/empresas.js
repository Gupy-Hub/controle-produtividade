Gestao.Empresas = {
    timerBusca: null,

    // --- CARREGAMENTO INICIAL (Apenas as primeiras 100 para ser rápido) ---
    carregar: async function() {
        const tbody = document.getElementById('lista-empresas');
        const contador = document.getElementById('contador-empresas');
        const searchInput = document.getElementById('search-empresas');

        // Se já tiver algo digitado, prioriza a busca
        if (searchInput && searchInput.value.trim().length > 0) {
            this.filtrar();
            return;
        }

        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8"><i class="fas fa-spinner fa-spin text-blue-500 text-xl"></i><p class="text-slate-400 mt-2">Carregando catálogo...</p></td></tr>';
        
        const { data, error } = await Sistema.supabase
            .from('empresas')
            .select('*')
            .order('nome', { ascending: true })
            .limit(100); // Limite inicial para a tela abrir instantaneamente

        if (error) { console.error(error); return; }

        this.renderizarTabela(data || [], "Exibindo as primeiras 100 (use a busca para ver mais)");
    },

    // --- BUSCA NO SERVIDOR (Ao digitar) ---
    filtrar: function() {
        const termo = document.getElementById('search-empresas').value.trim();
        
        clearTimeout(this.timerBusca);

        if (termo.length === 0) {
            this.carregar(); // Se limpar, volta ao padrão
            return;
        }

        // Delay de 500ms para esperar terminar de digitar
        this.timerBusca = setTimeout(() => {
            this.executarBusca(termo);
        }, 500);
    },

    executarBusca: async function(termo) {
        const tbody = document.getElementById('lista-empresas');
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-12"><i class="fas fa-circle-notch fa-spin text-blue-500 text-2xl"></i><p class="text-slate-400 mt-2">Buscando no banco de dados...</p></td></tr>';

        try {
            let query = Sistema.supabase
                .from('empresas')
                .select('*')
                .limit(100);

            // Lógica de Busca: ID ou (Nome ou Subdominio)
            if (!isNaN(termo) && termo.length > 0) {
                // Se for número, busca exata pelo ID
                query = query.eq('id', parseInt(termo));
            } else {
                // Se for texto, busca parcial (ILIKE) em nome ou subdominio
                // Sintaxe do Supabase para OR: "coluna.operador.valor,coluna.operador.valor"
                query = query.or(`nome.ilike.%${termo}%,subdominio.ilike.%${termo}%,observacao.ilike.%${termo}%`);
            }
            
            query = query.order('nome', { ascending: true });

            const { data, error } = await query;
            
            if (error) throw error;
            
            this.renderizarTabela(data || [], `Resultados para: "${termo}"`);

        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500">Erro na busca: ${e.message}</td></tr>`;
        }
    },

    renderizarTabela: function(lista, mensagemRodape = "") {
        const tbody = document.getElementById('lista-empresas');
        const contador = document.getElementById('contador-empresas');
        if (!tbody) return;

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-12 text-slate-400 flex flex-col items-center gap-2"><i class="fas fa-search text-3xl opacity-20"></i><span>Nenhuma empresa encontrada.</span></td></tr>';
            if(contador) contador.innerText = '0 Registros';
            return;
        }

        let html = '';
        lista.forEach(e => {
            // Formata data de entrada
            let dataFmt = '<span class="text-slate-300">-</span>';
            if (e.data_entrada) {
                try {
                    const partes = e.data_entrada.split('-');
                    if(partes.length === 3) dataFmt = `${partes[2]}/${partes[1]}/${partes[0]}`;
                    else dataFmt = e.data_entrada;
                } catch(err) { dataFmt = e.data_entrada; }
            }

            const empString = JSON.stringify(e).replace(/"/g, '&quot;');
            
            const obsTexto = e.observacao || '-';
            const obsClass = e.observacao ? 'text-slate-600' : 'text-slate-300';

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-sm group">
                <td class="px-4 py-3 font-mono text-slate-500 font-bold group-hover:text-blue-600 transition">#${e.id}</td>
                <td class="px-4 py-3 font-bold text-slate-700">${e.nome}</td>
                <td class="px-4 py-3 text-slate-600 font-mono text-xs"><span class="bg-slate-100 rounded px-2 py-1">${e.subdominio || '-'}</span></td>
                <td class="px-4 py-3 text-slate-600 font-semibold">${dataFmt}</td>
                <td class="px-4 py-3 ${obsClass} max-w-xs truncate" title="${obsTexto}">${obsTexto}</td>
                <td class="px-4 py-3 text-right flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="Gestao.Empresas.abrirModal(${empString})" class="p-1.5 text-blue-500 hover:bg-blue-50 rounded transition" title="Editar"><i class="fas fa-edit"></i></button>
                    <button onclick="Gestao.Empresas.excluir(${e.id})" class="p-1.5 text-red-400 hover:bg-red-50 rounded transition" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
        if(contador) {
            contador.innerHTML = `<strong>${lista.length}</strong> <span class="text-xs font-normal text-slate-400 ml-2">(${mensagemRodape})</span>`;
        }
    },

    // --- MODAL (Cadastro Manual e Edição) ---
    abrirModal: function(empresa = null) {
        const isEdit = !!empresa;
        const modalAntigo = document.getElementById('modal-empresa');
        if(modalAntigo) modalAntigo.remove();

        const modalHtml = `
        <div id="modal-empresa" class="fixed inset-0 bg-slate-900/40 z-[70] flex items-center justify-center backdrop-blur-sm animate-fade">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div class="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 class="text-lg font-bold text-slate-800">${isEdit ? 'Editar Empresa' : 'Nova Empresa'}</h3>
                    <button onclick="document.getElementById('modal-empresa').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="p-6 space-y-4">
                    <div class="grid grid-cols-4 gap-4">
                        <div class="col-span-1">
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">ID</label>
                            <input type="number" id="inp-emp-id" value="${empresa?.id || ''}" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition" ${isEdit ? 'disabled class="bg-slate-100 text-slate-500 w-full border border-slate-200 rounded-lg p-2.5 text-sm"' : ''} placeholder="123">
                        </div>
                        <div class="col-span-3">
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Nome da Empresa</label>
                            <input type="text" id="inp-emp-nome" value="${empresa?.nome || ''}" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition" placeholder="Razão Social ou Fantasia">
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Subdomínio</label>
                            <input type="text" id="inp-emp-sub" value="${empresa?.subdominio || ''}" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition" placeholder="ex: gupy">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Data Entrada</label>
                            <input type="date" id="inp-emp-data" value="${empresa?.data_entrada || ''}" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition">
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Observações</label>
                        <textarea id="inp-emp-obs" rows="3" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition" placeholder="Detalhes, contatos ou observações...">${empresa?.observacao || ''}</textarea>
                    </div>
                </div>

                <div class="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                    <button onclick="document.getElementById('modal-empresa').remove()" class="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-bold text-sm transition">Cancelar</button>
                    <button onclick="Gestao.Empresas.salvar(${isEdit})" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow-md transition active:scale-95">Salvar</button>
                </div>
            </div>
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    salvar: async function(isEdit) {
        const id = document.getElementById('inp-emp-id').value;
        const nome = document.getElementById('inp-emp-nome').value;
        const sub = document.getElementById('inp-emp-sub').value;
        const dataEntrada = document.getElementById('inp-emp-data').value || null;
        const obs = document.getElementById('inp-emp-obs').value;

        if (!id || !nome) return alert("Preencha ID e Nome.");

        const payload = {
            id: parseInt(id),
            nome: nome.trim(),
            subdominio: sub.trim().toLowerCase(),
            data_entrada: dataEntrada,
            observacao: obs.trim()
        };

        const { error } = await Sistema.supabase.from('empresas').upsert(payload);
        
        if (error) alert("Erro: " + error.message);
        else {
            document.getElementById('modal-empresa').remove();
            this.carregar(); // Recarrega para ver a alteração
        }
    },

    excluir: async function(id) {
        if (!confirm(`Confirma exclusão da empresa ID ${id}?`)) return;
        const { error } = await Sistema.supabase.from('empresas').delete().eq('id', id);
        if (error) alert("Não foi possível excluir (provavelmente possui histórico de produção vinculado).");
        else this.carregar();
    }
};
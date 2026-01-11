Gestao.Empresas = {
    timerBusca: null,
    
    // Estado Centralizado
    estado: {
        pagina: 0,
        limite: 50, // 50 empresas por página
        total: 0,
        termo: '',
        filtros: {
            nome: '',
            subdominio: '',
            obs: ''
        }
    },

    // --- CARREGAMENTO INICIAL ---
    carregar: async function() {
        this.estado.pagina = 0;
        this.limparCamposUI();
        this.buscarDados();
    },

    limparCamposUI: function() {
        const ids = ['search-empresas', 'filtro-emp-nome', 'filtro-emp-sub', 'filtro-emp-obs'];
        ids.forEach(id => {
            if(document.getElementById(id)) document.getElementById(id).value = '';
        });
    },

    // --- GATILHO DE BUSCA ---
    atualizarFiltrosEBuscar: function() {
        // 1. Coleta dados
        this.estado.termo = document.getElementById('search-empresas')?.value.trim() || '';
        this.estado.filtros.nome = document.getElementById('filtro-emp-nome')?.value.trim() || '';
        this.estado.filtros.subdominio = document.getElementById('filtro-emp-sub')?.value.trim() || '';
        this.estado.filtros.obs = document.getElementById('filtro-emp-obs')?.value.trim() || '';

        // 2. Reseta página
        this.estado.pagina = 0;

        // 3. Debounce
        clearTimeout(this.timerBusca);
        
        const tbody = document.getElementById('lista-empresas');
        if(tbody && tbody.rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12"><i class="fas fa-circle-notch fa-spin text-blue-500 text-2xl"></i><p class="text-slate-400 mt-2">Atualizando...</p></td></tr>`;
        }

        this.timerBusca = setTimeout(() => {
            this.buscarDados();
        }, 500);
    },

    mudarPagina: function(delta) {
        const novaPagina = this.estado.pagina + delta;
        const maxPaginas = Math.ceil(this.estado.total / this.estado.limite);

        if (novaPagina >= 0 && (this.estado.total === 0 || novaPagina < maxPaginas)) {
            this.estado.pagina = novaPagina;
            this.buscarDados();
        }
    },

    // --- COMUNICAÇÃO COM O SERVIDOR (RPC V1) ---
    buscarDados: async function() {
        const tbody = document.getElementById('lista-empresas');
        const infoPag = document.getElementById('info-paginacao-emp');
        const btnAnt = document.getElementById('btn-ant-emp');
        const btnProx = document.getElementById('btn-prox-emp');

        if(infoPag) infoPag.innerHTML = `<span class="text-blue-500"><i class="fas fa-sync fa-spin"></i> Buscando...</span>`;
        if(btnAnt) btnAnt.disabled = true;
        if(btnProx) btnProx.disabled = true;

        try {
            const { data, error } = await Sistema.supabase.rpc('buscar_empresas_v1', {
                p_termo: this.estado.termo,
                p_nome: this.estado.filtros.nome,
                p_subdominio: this.estado.filtros.subdominio,
                p_obs: this.estado.filtros.obs,
                p_page: this.estado.pagina,
                p_limit: this.estado.limite
            });

            if (error) throw error;

            const lista = data || [];
            
            // Total vem na primeira linha
            this.estado.total = lista.length > 0 ? lista[0].total_registros : 0;
            if(lista.length === 0 && this.estado.pagina === 0) this.estado.total = 0;

            this.renderizarTabela(lista);
            this.atualizarControlesPaginacao();

        } catch (e) {
            console.error(e);
            let msg = e.message;
            if (msg.includes("timeout")) msg = "A busca demorou muito. Tente filtrar mais.";
            if(tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500 font-bold">${msg}</td></tr>`;
        }
    },

    renderizarTabela: function(lista) {
        const tbody = document.getElementById('lista-empresas');
        
        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-12 text-slate-400 flex flex-col items-center gap-2"><i class="fas fa-filter text-3xl opacity-20"></i><span>Nenhuma empresa encontrada.</span></td></tr>';
            return;
        }

        let html = '';
        lista.forEach(e => {
            // Formata data
            let dataFmt = '<span class="text-slate-300">-</span>';
            if (e.data_entrada) {
                try {
                    const partes = e.data_entrada.split('-');
                    if(partes.length === 3) dataFmt = `${partes[2]}/${partes[1]}/${partes[0]}`;
                    else dataFmt = e.data_entrada;
                } catch(err) { dataFmt = e.data_entrada; }
            }

            // Sanitiza objeto para o modal
            // Cria um objeto limpo para passar para o modal, evitando aspas quebravam o HTML
            const objParaModal = {
                id: e.id,
                nome: e.nome,
                subdominio: e.subdominio,
                data_entrada: e.data_entrada,
                observacao: e.observacao
            };
            const empString = JSON.stringify(objParaModal).replace(/"/g, '&quot;');
            
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
    },

    atualizarControlesPaginacao: function() {
        const infoPag = document.getElementById('info-paginacao-emp');
        const btnAnt = document.getElementById('btn-ant-emp');
        const btnProx = document.getElementById('btn-prox-emp');

        const total = this.estado.total;
        const inicio = (this.estado.pagina * this.estado.limite) + 1;
        let fim = (this.estado.pagina + 1) * this.estado.limite;
        if (fim > total) fim = total;

        if (total === 0) {
            infoPag.innerHTML = "Nenhum resultado.";
            btnAnt.disabled = true;
            btnProx.disabled = true;
        } else {
            infoPag.innerHTML = `Exibindo <b>${inicio}</b> a <b>${fim}</b> de <b>${total.toLocaleString('pt-BR')}</b> empresas.`;
            btnAnt.disabled = this.estado.pagina === 0;
            btnProx.disabled = fim >= total;
        }
    },

    // --- MODAL (Mantido igual, mas atualiza via buscarDados) ---
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
                            <input type="number" id="inp-emp-id" value="${empresa?.id || ''}" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition" ${isEdit ? 'disabled class="bg-slate-100 text-slate-500 w-full border border-slate-200 rounded-lg p-2.5 text-sm"' : ''} placeholder="Auto">
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
        const idInput = document.getElementById('inp-emp-id').value;
        const nome = document.getElementById('inp-emp-nome').value;
        const sub = document.getElementById('inp-emp-sub').value;
        const dataEntrada = document.getElementById('inp-emp-data').value || null;
        const obs = document.getElementById('inp-emp-obs').value;

        if (!nome) return alert("Preencha o Nome da Empresa.");

        const payload = {
            nome: nome.trim(),
            subdominio: sub.trim().toLowerCase(),
            data_entrada: dataEntrada,
            observacao: obs.trim()
        };

        // Se for edição, usa o ID fixo. Se for novo e tiver ID preenchido, usa ele.
        if (isEdit) payload.id = parseInt(idInput);
        else if (idInput) payload.id = parseInt(idInput);

        const { error } = await Sistema.supabase.from('empresas').upsert(payload);
        
        if (error) alert("Erro: " + error.message);
        else {
            document.getElementById('modal-empresa').remove();
            this.buscarDados(); // Atualiza a lista
        }
    },

    excluir: async function(id) {
        if (!confirm(`Confirma exclusão da empresa ID ${id}?`)) return;
        const { error } = await Sistema.supabase.from('empresas').delete().eq('id', id);
        if (error) alert("Não foi possível excluir (provavelmente possui histórico de produção vinculado).");
        else this.buscarDados();
    }
};
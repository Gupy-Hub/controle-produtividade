Gestao.Empresas = {
    listaCompleta: [],

    carregar: async function() {
        const tbody = document.getElementById('lista-empresas');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8"><i class="fas fa-spinner fa-spin text-blue-500 text-xl"></i></td></tr>';
        
        const { data, error } = await Sistema.supabase.from('empresas').select('*').order('nome');
        if (error) { console.error(error); return; }

        this.listaCompleta = data || [];
        this.filtrar();
    },

    filtrar: function() {
        const inputBusca = document.getElementById('search-empresas');
        const termo = inputBusca ? inputBusca.value.toLowerCase().trim() : '';

        const filtrados = this.listaCompleta.filter(e => {
            if (termo) {
                const searchStr = `${e.id} ${e.nome} ${e.subdominio || ''} ${e.observacao || ''}`.toLowerCase();
                return searchStr.includes(termo);
            }
            return true;
        });

        this.renderizarTabela(filtrados);
    },

    renderizarTabela: function(lista) {
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
                // Garante que não quebra se a data vier estranha do banco
                try {
                    const partes = e.data_entrada.split('-');
                    if(partes.length === 3) dataFmt = `${partes[2]}/${partes[1]}/${partes[0]}`;
                    else dataFmt = e.data_entrada;
                } catch(err) { dataFmt = e.data_entrada; }
            }

            const empString = JSON.stringify(e).replace(/"/g, '&quot;');

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-sm group">
                <td class="px-4 py-3 font-mono text-slate-500 font-bold group-hover:text-blue-600 transition">#${e.id}</td>
                <td class="px-4 py-3 font-bold text-slate-700">${e.nome}</td>
                <td class="px-4 py-3 text-slate-600 font-mono text-xs"><span class="bg-slate-100 rounded px-2 py-1">${e.subdominio || '-'}</span></td>
                <td class="px-4 py-3 text-slate-600 font-semibold">${dataFmt}</td>
                <td class="px-4 py-3 text-slate-500 max-w-xs truncate" title="${e.observacao || ''}">${e.observacao || '-'}</td>
                <td class="px-4 py-3 text-right flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="Gestao.Empresas.abrirModal(${empString})" class="p-1.5 text-blue-500 hover:bg-blue-50 rounded transition" title="Editar"><i class="fas fa-edit"></i></button>
                    <button onclick="Gestao.Empresas.excluir(${e.id})" class="p-1.5 text-red-400 hover:bg-red-50 rounded transition" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
        if(contador) contador.innerText = `${lista.length} Registros`;
    },

    // --- MODAL ---
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
                            <input type="text" id="inp-emp-nome" value="${empresa?.nome || ''}" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition" placeholder="Razão Social">
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
                        <textarea id="inp-emp-obs" rows="3" class="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition" placeholder="Informações adicionais...">${empresa?.observacao || ''}</textarea>
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
            this.carregar();
        }
    },

    excluir: async function(id) {
        if (!confirm(`Excluir empresa ID ${id}?`)) return;
        const { error } = await Sistema.supabase.from('empresas').delete().eq('id', id);
        if (error) alert("Não foi possível excluir (provavelmente possui dados vinculados).");
        else this.carregar();
    }
};
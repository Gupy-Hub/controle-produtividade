Gestao.Empresas = {
    carregar: async function() {
        try {
            const { data, error } = await Gestao.supabase.from('empresas').select('*').order('nome');
            const container = document.getElementById('lista-empresas');
            if (error) {
                console.warn("Tabela empresas pode não existir.", error);
                container.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500 text-xs">Erro: Tabela 'empresas' não encontrada.</td></tr>`;
                return;
            }
            Gestao.dados.empresas = data || [];
            this.renderizar(Gestao.dados.empresas);
        } catch (err) { console.error(err); }
    },

    renderizar: function(lista) {
        const container = document.getElementById('lista-empresas');
        if (lista.length === 0) {
            container.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400 text-xs">Nenhuma empresa cadastrada.</td></tr>`;
            return;
        }

        let html = '';
        lista.forEach(e => {
            const dataFmt = e.data_entrada ? e.data_entrada.split('-').reverse().join('/') : '-';
            const empresaJson = JSON.stringify(e).replace(/"/g, '&quot;');
            
            html += `
            <tr class="hover:bg-slate-50 transition border-b border-slate-50 group">
                <td class="px-6 py-4 font-bold text-slate-600">#${e.id}</td>
                <td class="px-6 py-4 font-bold text-slate-800">${e.nome}</td>
                <td class="px-6 py-4 text-blue-600 text-xs font-mono bg-blue-50/50 rounded px-2 w-fit">${e.subdominio || '-'}</td>
                <td class="px-6 py-4 text-center text-slate-500 text-xs">${dataFmt}</td>
                <td class="px-6 py-4 text-slate-500 text-xs max-w-xs truncate" title="${e.observacao || ''}">${e.observacao || '-'}</td>
                <td class="px-6 py-4 text-center">
                    <button onclick="Gestao.Empresas.abrirModal(${empresaJson})" class="text-slate-400 hover:text-blue-600 transition">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>`;
        });
        container.innerHTML = html;
    },

    filtrar: function() {
        const term = document.getElementById('search-empresa').value.toLowerCase();
        const filtered = Gestao.dados.empresas.filter(e => 
            e.nome.toLowerCase().includes(term) || 
            String(e.id).includes(term) ||
            (e.subdominio && e.subdominio.toLowerCase().includes(term))
        );
        this.renderizar(filtered);
    },

    // --- MODAL ---
    abrirModal: function(empresa = null) {
        const m = document.getElementById('modal-empresa');
        m.classList.remove('hidden'); m.classList.add('flex');
        
        const btnDel = document.getElementById('btn-empresa-delete');
        const inputId = document.getElementById('form-empresa-id');

        if (empresa) {
            document.getElementById('modal-empresa-title').innerText = "Editar Empresa";
            inputId.value = empresa.id; inputId.disabled = true; inputId.classList.add('bg-slate-100');
            document.getElementById('form-empresa-nome').value = empresa.nome;
            document.getElementById('form-empresa-sub').value = empresa.subdominio || '';
            document.getElementById('form-empresa-data').value = empresa.data_entrada || '';
            document.getElementById('form-empresa-obs').value = empresa.observacao || '';
            btnDel.classList.remove('hidden');
        } else {
            document.getElementById('modal-empresa-title').innerText = "Nova Empresa";
            inputId.value = ""; inputId.disabled = false; inputId.classList.remove('bg-slate-100');
            document.getElementById('form-empresa-nome').value = "";
            document.getElementById('form-empresa-sub').value = "";
            document.getElementById('form-empresa-data').value = new Date().toISOString().substring(0, 10);
            document.getElementById('form-empresa-obs').value = "";
            btnDel.classList.add('hidden');
        }
    },

    salvar: async function() {
        const id = document.getElementById('form-empresa-id').value;
        const nome = document.getElementById('form-empresa-nome').value;
        const sub = document.getElementById('form-empresa-sub').value;
        const data = document.getElementById('form-empresa-data').value;
        const obs = document.getElementById('form-empresa-obs').value;
        
        if (!id || !nome) return alert("ID e Nome são obrigatórios.");

        try {
            const payload = {
                id: parseInt(id),
                nome: nome,
                subdominio: sub,
                data_entrada: data || null,
                observacao: obs
            };

            const { error } = await Gestao.supabase.from('empresas').upsert(payload);
            if (error) throw error;

            alert("Empresa salva com sucesso!");
            Gestao.fecharModais();
            this.carregar();
        } catch (err) {
            alert("Erro ao salvar: " + err.message);
        }
    },

    excluir: async function() {
        const id = document.getElementById('form-empresa-id').value;
        if (!confirm(`Tem certeza que deseja excluir a empresa ID ${id}?`)) return;

        try {
            const { error } = await Gestao.supabase.from('empresas').delete().eq('id', id);
            if (error) throw error;
            alert("Empresa excluída.");
            Gestao.fecharModais();
            this.carregar();
        } catch (err) {
            alert("Erro ao excluir: " + err.message);
        }
    }
};
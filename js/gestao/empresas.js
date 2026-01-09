Gestao.Empresas = {
    carregar: async function() {
        const tbody = document.getElementById('lista-empresas');
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i></td></tr>';
        
        const { data } = await Sistema.supabase.from('empresas').select('*').order('nome');
        
        let html = '';
        (data || []).forEach(e => {
            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-xs">
                <td class="px-6 py-3 font-mono text-slate-500">${e.id}</td>
                <td class="px-6 py-3 font-bold text-slate-700">${e.nome}</td>
                <td class="px-6 py-3 text-slate-500 truncate max-w-xs">${e.observacao || '-'}</td>
                <td class="px-6 py-3 text-right">
                    <button onclick="Gestao.Empresas.excluir(${e.id})" class="text-red-400 hover:text-red-600"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="4" class="text-center py-4 text-slate-400">Nenhuma empresa cadastrada.</td></tr>';
    },

    importar: async function(input) {
        if (!input.files[0]) return;
        try {
            const linhas = await Gestao.lerArquivo(input.files[0]);
            const upserts = [];
            
            for (const row of linhas) {
                const chaves = {};
                Object.keys(row).forEach(k => chaves[k.trim().toLowerCase()] = row[k]);
                
                const nome = chaves['nome'] || chaves['empresa'];
                if (!nome) continue;

                // Se tiver ID no arquivo, usa. Se não, o banco gera (omitindo o campo ID no payload).
                const payload = { nome: String(nome).trim() };
                if (chaves['id']) payload.id = parseInt(chaves['id']);
                if (chaves['obs']) payload.observacao = chaves['obs'];

                upserts.push(payload);
            }

            if (upserts.length) {
                const { error } = await Sistema.supabase.from('empresas').upsert(upserts);
                if (error) throw error;
                alert(`${upserts.length} empresas processadas.`);
                this.carregar();
            }
        } catch (e) { alert("Erro: " + e.message); }
        input.value = "";
    },

    excluir: async function(id) {
        if(!confirm("Excluir empresa?")) return;
        const { error } = await Sistema.supabase.from('empresas').delete().eq('id', id);
        if(error) alert("Erro: Possui vínculos."); else this.carregar();
    }
};
Gestao.Usuarios = {
    carregar: async function() {
        const tbody = document.getElementById('lista-usuarios');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><i class="fas fa-spinner fa-spin"></i></td></tr>';
        
        const { data, error } = await Sistema.supabase.from('usuarios').select('*').order('nome');
        if (error) { console.error(error); return; }

        let html = '';
        data.forEach(u => {
            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-50 transition text-xs">
                <td class="px-6 py-3 font-mono text-slate-500">${u.id}</td>
                <td class="px-6 py-3 font-bold text-slate-700">${u.nome}</td>
                <td class="px-6 py-3">${u.funcao || '-'}</td>
                <td class="px-6 py-3">${u.ativo ? '<span class="text-emerald-600">Ativo</span>' : '<span class="text-red-400">Inativo</span>'}</td>
                <td class="px-6 py-3 text-right">
                    <button onclick="Gestao.Usuarios.excluir(${u.id})" class="text-red-400 hover:text-red-600"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="5" class="text-center py-4 text-slate-400">Nenhum usuário cadastrado.</td></tr>';
    },

    importar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        try {
            const linhas = await Gestao.lerArquivo(file);
            const upserts = [];
            let erros = 0;

            for (const row of linhas) {
                // Normaliza chaves
                const chaves = {};
                Object.keys(row).forEach(k => chaves[k.trim().toLowerCase()] = row[k]);

                // Campos Obrigatórios: ID e Nome
                // Tenta achar ID em várias colunas possíveis
                const idRaw = chaves['id'] || chaves['matricula'] || chaves['código'] || chaves['codigo'];
                const nome = chaves['nome'] || chaves['usuario'] || chaves['colaborador'] || chaves['assistente'];

                if (!idRaw || !nome) {
                    console.warn("Linha ignorada (sem ID ou Nome):", row);
                    continue; 
                }

                upserts.push({
                    id: parseInt(idRaw), // Força conversão para Inteiro
                    nome: String(nome).trim(),
                    senha: '123', // Senha padrão se não vier
                    funcao: chaves['funcao'] || 'Assistente',
                    cargo: chaves['cargo'] || 'Assistente',
                    perfil: (chaves['funcao']||'').toLowerCase().includes('gest') ? 'admin' : 'user',
                    ativo: true
                });
            }

            if (upserts.length > 0) {
                const { error } = await Sistema.supabase.from('usuarios').upsert(upserts);
                if (error) throw error;
                alert(`Sucesso! ${upserts.length} usuários importados/atualizados.`);
                this.carregar();
            } else {
                alert("Nenhum usuário válido encontrado no arquivo. Verifique se as colunas 'ID' e 'Nome' existem.");
            }

        } catch (e) {
            console.error(e);
            alert("Erro na importação: " + e.message);
        } finally {
            input.value = "";
        }
    },

    excluir: async function(id) {
        if (!confirm(`Excluir usuário ${id}?`)) return;
        const { error } = await Sistema.supabase.from('usuarios').delete().eq('id', id);
        if (error) alert("Erro ao excluir (Pode haver dados vinculados).");
        else this.carregar();
    }
};
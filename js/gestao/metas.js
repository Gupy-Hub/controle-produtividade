Gestao.Metas = {
    carregar: async function() {
        const container = document.getElementById('container-metas-lista');
        const { data } = await Sistema.supabase.from('metas').select('*, usuarios(nome)').order('data_inicio', {ascending: false}).limit(50);
        
        if (!data || !data.length) {
            container.innerHTML = '<p class="text-center text-slate-400 py-4">Nenhuma meta configurada recentemente.</p>';
            return;
        }

        let html = '<table class="w-full text-xs text-left"><thead class="bg-slate-50 font-bold text-slate-500"><tr><th class="p-2">Data Início</th><th class="p-2">Usuário</th><th class="p-2">Meta</th></tr></thead><tbody>';
        data.forEach(m => {
            html += `<tr class="border-b border-slate-100">
                <td class="p-2">${m.data_inicio.split('-').reverse().join('/')}</td>
                <td class="p-2">${m.usuarios?.nome || 'ID: '+m.usuario_id}</td>
                <td class="p-2 font-bold text-blue-600">${m.valor_meta}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    },

    importar: async function(input) {
        if(!input.files[0]) return;
        try {
            const linhas = await Gestao.lerArquivo(input.files[0]);
            const upserts = [];
            
            // Busca IDs de usuarios para mapear nomes se necessário
            const { data: users } = await Sistema.supabase.from('usuarios').select('id, nome');
            const mapUser = {};
            users.forEach(u => mapUser[u.nome.toLowerCase().trim()] = u.id);

            for (const row of linhas) {
                const c = {};
                Object.keys(row).forEach(k => c[k.trim().toLowerCase()] = row[k]);

                // Precisa de usuario e meta
                let uid = c['id_usuario'] || c['id'];
                const nome = c['usuario'] || c['nome'];
                
                if (!uid && nome && mapUser[nome.toLowerCase().trim()]) {
                    uid = mapUser[nome.toLowerCase().trim()];
                }

                if (!uid) continue;

                // Data (Fallback para hoje)
                let dataIni = c['data'] || c['inicio'] || new Date().toISOString().split('T')[0];

                upserts.push({
                    usuario_id: parseInt(uid),
                    data_inicio: dataIni,
                    valor_meta: parseFloat(c['meta'] || c['valor'] || 0)
                });
            }

            if(upserts.length) {
                const { error } = await Sistema.supabase.from('metas').upsert(upserts);
                if(error) throw error;
                alert("Metas importadas com sucesso!");
                this.carregar();
            } else {
                alert("Nenhuma meta válida encontrada (Verifique IDs e Colunas).");
            }
        } catch(e) { alert("Erro: " + e.message); }
        input.value = "";
    }
};
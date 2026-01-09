window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Empresas = {
    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // Feedback Visual
        const btnLabel = input.parentElement;
        const originalHtml = btnLabel.innerHTML;
        btnLabel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';
        btnLabel.classList.add('opacity-50', 'cursor-not-allowed');

        try {
            const linhas = await Gestao.lerArquivo(file);
            const upserts = [];

            for (const row of linhas) {
                // Normaliza chaves
                const c = {};
                Object.keys(row).forEach(k => c[this.normalizarChave(k)] = row[k]);

                // Campos Obrigatórios
                // O ID pode vir como "idempresa" ou "id"
                const id = parseInt(c['idempresa'] || c['id'] || 0);
                const nome = c['nome'] || c['empresa'] || '';
                
                if (!id || !nome) continue;

                // Tratamento de Data (Entrou para mesa)
                let dataEntrada = null;
                const rawDate = c['entrouparamesa'] || c['dataentrada'];
                if (rawDate) {
                    // Tenta converter se for YYYY-MM-DD
                    // Se vier do Excel como número serial, a função lerArquivo (XLSX) já tenta converter,
                    // mas se vier string, garantimos o formato ISO.
                    try {
                        // Verifica se é data válida
                        if(new Date(rawDate).toString() !== 'Invalid Date') {
                            dataEntrada = new Date(rawDate).toISOString().split('T')[0];
                        }
                    } catch(e) {}
                }

                upserts.push({
                    id: id,
                    nome: String(nome).trim(),
                    subdominio: String(c['subdominio'] || '').trim().toLowerCase(),
                    data_entrada: dataEntrada,
                    observacao: String(c['obs'] || c['observacao'] || '').trim()
                });
            }

            if (upserts.length > 0) {
                const { error } = await Sistema.supabase.from('empresas').upsert(upserts);
                if (error) throw error;
                
                alert(`Importação concluída!\n${upserts.length} empresas processadas.`);
                
                // Atualiza a tela se estiver carregada
                if (Gestao.Empresas && typeof Gestao.Empresas.carregar === 'function') {
                    Gestao.Empresas.carregar();
                }
            } else {
                alert("Nenhuma empresa válida encontrada. Verifique as colunas 'ID Empresa' e 'Nome'.");
            }

        } catch (e) {
            console.error(e);
            alert("Erro na importação: " + e.message);
        } finally {
            btnLabel.innerHTML = originalHtml;
            btnLabel.classList.remove('opacity-50', 'cursor-not-allowed');
            input.value = "";
        }
    },

    normalizarChave: function(k) {
        // Remove acentos, espaços e deixa minúsculo
        return k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/ /g, '');
    }
};
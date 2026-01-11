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
                const id = parseInt(c['idempresa'] || c['id'] || 0);
                const nome = c['nome'] || c['empresa'] || '';
                
                if (!id || !nome) continue;

                // TRATAMENTO ROBUSTO DE DATA
                // Tenta ler colunas comuns para data
                const rawDate = c['entrouparamesa'] || c['dataentrada'] || c['inicio'] || c['data'];
                let dataEntrada = null;

                if (rawDate) {
                    dataEntrada = this.parseData(rawDate);
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

    // Função Auxiliar para converter qualquer formato de data para YYYY-MM-DD
    parseData: function(valor) {
        if (!valor) return null;

        // 1. Se for número (Excel Serial Date)
        if (typeof valor === 'number' && valor > 20000) {
            const date = new Date(Math.round((valor - 25569) * 864e5));
            return date.toISOString().split('T')[0];
        }

        // 2. Se for string
        const str = String(valor).trim();
        
        // Formato BR: DD/MM/YYYY
        if (str.includes('/')) {
            const partes = str.split('/');
            if (partes.length === 3) {
                // Assume dia/mes/ano
                return `${partes[2]}-${partes[1]}-${partes[0]}`;
            }
        }

        // Formato ISO ou Excel Texto: YYYY-MM-DD
        if (str.includes('-')) {
            // Pega apenas a parte da data (ignora hora se houver T)
            return str.split('T')[0];
        }

        return null;
    },

    normalizarChave: function(k) {
        return k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/ /g, '');
    }
};
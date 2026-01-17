// ARQUIVO: js/produtividade/importacao/validacao.js
window.Produtividade = window.Produtividade || {};
window.Produtividade.Importacao = window.Produtividade.Importacao || {};

window.Produtividade.Importacao.Validacao = {
    dadosProcessados: [],

    init: function() {
        console.log("📥 Importação de Produção: Engine V2.5 (Public Access Mode)");
    },

    extrairDataDoNome: function(nome) {
        const match = nome.match(/(\d{2})(\d{2})(\d{4})/);
        if (match) {
            const [_, dia, mes, ano] = match;
            return `${ano}-${mes}-${dia}`;
        }
        return null;
    },

    processar: async function(input) {
        const files = Array.from(input.files);
        if (files.length === 0) return;

        this.dadosProcessados = [];
        const statusEl = document.getElementById('status-importacao-prod');
        if(statusEl) statusEl.classList.remove('hidden');

        try {
            for (const file of files) {
                if(statusEl) statusEl.innerHTML = `<span class="text-blue-500"><i class="fas fa-spinner fa-spin"></i> Lendo ${file.name}...</span>`;
                const dataArquivo = this.extrairDataDoNome(file.name);
                
                if (!dataArquivo) {
                    alert(`⚠️ Nome inválido: ${file.name}`);
                    continue;
                }

                await new Promise((resolve, reject) => {
                    Papa.parse(file, {
                        header: true, skipEmptyLines: true, encoding: "UTF-8",
                        transformHeader: h => h.trim().toLowerCase(),
                        complete: (res) => { this.prepararDados(res.data, dataArquivo); resolve(); },
                        error: (err) => reject(err)
                    });
                });
            }
            this.finalizarAnalise();
        } catch (err) { console.error(err); }
        input.value = '';
    },

    prepararDados: function(linhas, dataFixa) {
        linhas.forEach(row => {
            let idRaw = row['id_assistente'] || row['id'] || row['usuario_id'] || row['matrícula'];
            if (!idRaw) return;

            const usuarioId = parseInt(idRaw.toString().replace(/\D/g, ''));
            if (isNaN(usuarioId)) return;

            this.dadosProcessados.push({
                usuario_id: usuarioId,
                data_referencia: dataFixa,
                quantidade: parseInt(row['documentos_validados'] || row['quantidade'] || row['qtd'] || 0),
                fifo: parseInt(row['fifo'] || 0),
                gradual_total: parseInt(row['gradual_total'] || 0),
                gradual_parcial: parseInt(row['gradual_parcial'] || 0),
                perfil_fc: parseInt(row['perfil_fc'] || 0),
                fator: 1,
                status: 'OK'
            });
        });
    },

    finalizarAnalise: function() {
        if (this.dadosProcessados.length === 0) return alert("Sem dados.");
        if (confirm(`Gravar ${this.dadosProcessados.length} registros (Massa/Unidade)?`)) {
            this.salvarNoBanco();
        }
    },

    salvarNoBanco: async function() {
        const statusEl = document.getElementById('status-importacao-prod');
        try {
            if(statusEl) statusEl.innerHTML = `<span class="text-orange-500">Gravando...</span>`;

            // Envio direto sem verificação de auth no JS (depende da política TO public no banco)
            const { error } = await Sistema.supabase
                .from('producao')
                .upsert(this.dadosProcessados, { onConflict: 'usuario_id,data_referencia' });

            if (error) throw error;

            alert("✅ Sucesso! Os dados já estão no banco.");
            if (window.Produtividade.Geral?.carregarTela) window.Produtividade.Geral.carregarTela();

        } catch (e) {
            console.error("Erro Final:", e);
            alert("Erro: " + e.message);
        } finally {
            if(statusEl) statusEl.innerHTML = "";
        }
    }
};

window.Produtividade.Importacao.Validacao.init();